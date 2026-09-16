/**
 * Greenhouse-style routes
 * Real URL pattern: https://boards.greenhouse.io/{board}/jobs
 * Mock:            http://localhost:4000/greenhouse/{board}/jobs
 */
import type { FastifyInstance } from 'fastify';
import {
  getJobsByAts, getJobById, submitApplication, checkRateLimit,
  shouldShowCaptcha, DuplicateApplicationError,
} from '../store.js';
import { applyFormHtml, captchaHtml, confirmationHtml } from '../templates.js';

export async function greenhouseRoutes(app: FastifyInstance) {

  // GET /greenhouse/:board/jobs  — JSON listing (mirrors Greenhouse board API)
  app.get('/greenhouse/:board/jobs', async (req, reply) => {
    const { board } = req.params as { board: string };
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Too many requests' });

    const jobs = getJobsByAts('greenhouse', board);
    return reply.send({
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        location: { name: j.location },
        updated_at: j.postedAt,
        absolute_url: `http://localhost:${process.env.MOCK_ATS_PORT || 4000}/greenhouse/${board}/jobs/${j.id}`,
        departments: [{ name: j.department }],
        offices: [{ name: j.location }],
      })),
    });
  });

  // GET /greenhouse/:board/jobs/:id  — JSON job detail
  app.get('/greenhouse/:board/jobs/:id', async (req, reply) => {
    const { id } = req.params as { board: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });

    return reply.send({
      id: job.id,
      title: job.title,
      content: job.description,
      location: { name: job.location },
      updated_at: job.postedAt,
      apply: `http://localhost:${process.env.MOCK_ATS_PORT || 4000}/greenhouse/${job.tenant}/jobs/${job.id}/apply`,
      questions: job.customQuestions.map((q) => ({
        required: q.required,
        label: q.label,
        fields: [{ name: q.id, type: q.type, values: q.options?.map((o) => ({ label: o, value: o })) ?? [] }],
      })),
      compensation_fields: job.salary
        ? [{ compensation_type: 'salary', min_value: String(job.salary.min), max_value: String(job.salary.max), currency: job.salary.currency }]
        : [],
    });
  });

  // GET /greenhouse/:board/jobs/:id/apply  — HTML application form
  app.get('/greenhouse/:board/jobs/:id/apply', async (req, reply) => {
    const { board, id } = req.params as { board: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Job not found</h1>');
    if (shouldShowCaptcha(id)) {
      return reply.type('text/html').send(captchaHtml({ job, ats: 'greenhouse', board }));
    }
    return reply.type('text/html').send(
      applyFormHtml({
        job,
        action: `/greenhouse/${board}/jobs/${id}/apply`,
        atsLabel: 'Greenhouse',
      })
    );
  });

  // POST /greenhouse/:board/jobs/:id/apply  — submit application (multipart)
  app.post('/greenhouse/:board/jobs/:id/apply', async (req, reply) => {
    const { board, id } = req.params as { board: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });

    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Rate limit exceeded' });

    // Accept both multipart and JSON (for API-style tests)
    let fields: Record<string, string> = {};
    let resumeFilename: string | undefined;
    let coverLetter: string | undefined;

    const ct = req.headers['content-type'] ?? '';
    if (ct.includes('multipart/form-data')) {
      const parts = await (req as any).parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          resumeFilename = part.filename;
          // drain the stream
          for await (const _ of part.file) { /* noop */ }
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }
    } else {
      fields = (req.body as Record<string, string>) ?? {};
    }

    if (fields['cover_letter']) {
      coverLetter = fields['cover_letter'];
    }

    // Validate required fields from job's custom questions
    const missing = job.customQuestions
      .filter((q) => q.required && !fields[q.id])
      .map((q) => q.label);
    if (missing.length > 0) {
      return reply.code(422).send({ error: 'Missing required fields', fields: missing });
    }

    try {
      const app = submitApplication({
        jobId: id,
        ats: 'greenhouse',
        tenant: board,
        fields,
        resumeFilename,
        coverLetter,
        ip: req.ip,
      });

      if (ct.includes('application/json')) {
        return reply.code(201).send({ id: app.id, message: 'Application submitted', submittedAt: app.submittedAt });
      }
      return reply.type('text/html').send(confirmationHtml({ job, applicationId: app.id, ats: 'Greenhouse' }));
    } catch (err) {
      if (err instanceof DuplicateApplicationError) {
        return reply.code(409).send({ error: 'Already applied', message: err.message });
      }
      throw err;
    }
  });
}
