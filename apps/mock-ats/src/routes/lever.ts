/**
 * Lever-style routes
 * Real URL pattern: https://jobs.lever.co/{company}
 * Mock:            http://localhost:4000/lever/{company}/jobs
 */
import type { FastifyInstance } from 'fastify';
import {
  getJobsByAts, getJobById, submitApplication, checkRateLimit,
  shouldShowCaptcha, DuplicateApplicationError,
} from '../store.js';
import { applyFormHtml, captchaHtml, confirmationHtml } from '../templates.js';

export async function leverRoutes(app: FastifyInstance) {

  // GET /lever/:company/jobs  — JSON listing
  app.get('/lever/:company/jobs', async (req, reply) => {
    const { company } = req.params as { company: string };
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Too many requests' });

    const jobs = getJobsByAts('lever', company);
    const port = process.env.MOCK_ATS_PORT || 4000;

    return reply.send(
      jobs.map((j) => ({
        id: j.id,
        text: j.title,
        hostedUrl: `http://localhost:${port}/lever/${company}/jobs/${j.id}`,
        applyUrl: `http://localhost:${port}/lever/${company}/jobs/${j.id}/apply`,
        categories: {
          department: j.department,
          location: j.location,
          team: j.department,
        },
        createdAt: new Date(j.postedAt).getTime(),
        descriptionPlain: j.description,
        salaryDescription: j.salary
          ? `${j.salary.currency} ${j.salary.min.toLocaleString()} – ${j.salary.max.toLocaleString()}`
          : null,
      }))
    );
  });

  // GET /lever/:company/jobs/:id  — JSON job detail
  app.get('/lever/:company/jobs/:id', async (req, reply) => {
    const { company, id } = req.params as { company: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    const port = process.env.MOCK_ATS_PORT || 4000;

    return reply.send({
      id: job.id,
      text: job.title,
      descriptionPlain: job.description,
      applyUrl: `http://localhost:${port}/lever/${company}/jobs/${job.id}/apply`,
      hostedUrl: `http://localhost:${port}/lever/${company}/jobs/${job.id}`,
      categories: { department: job.department, location: job.location },
    });
  });

  // GET /lever/:company/jobs/:id/apply  — HTML form (Lever style)
  app.get('/lever/:company/jobs/:id/apply', async (req, reply) => {
    const { company, id } = req.params as { company: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Not Found</h1>');
    if (shouldShowCaptcha(id)) {
      return reply.type('text/html').send(captchaHtml({ job, ats: 'lever', board: company }));
    }
    return reply.type('text/html').send(
      applyFormHtml({ job, action: `/lever/${company}/jobs/${id}/apply`, atsLabel: 'Lever' })
    );
  });

  // POST /lever/:company/jobs/:id/apply  — submit
  app.post('/lever/:company/jobs/:id/apply', async (req, reply) => {
    const { company, id } = req.params as { company: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send({ error: 'Not found' });

    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Rate limit exceeded' });

    let fields: Record<string, string> = {};
    let resumeFilename: string | undefined;
    let coverLetter: string | undefined;
    const ct = req.headers['content-type'] ?? '';

    if (ct.includes('multipart/form-data')) {
      const parts = await (req as any).parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          resumeFilename = part.filename;
          for await (const _ of part.file) { /* drain */ }
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }
    } else {
      fields = (req.body as Record<string, string>) ?? {};
    }
    coverLetter = fields['cover_letter'];

    const missing = job.customQuestions
      .filter((q) => q.required && !fields[q.id])
      .map((q) => q.label);
    if (missing.length > 0) {
      return reply.code(422).send({ error: 'Missing required fields', fields: missing });
    }

    try {
      const application = submitApplication({
        jobId: id, ats: 'lever', tenant: company, fields, resumeFilename, coverLetter, ip: req.ip,
      });
      if (ct.includes('application/json')) {
        return reply.code(201).send({ applicationId: application.id, ok: true });
      }
      return reply.type('text/html').send(confirmationHtml({ job, applicationId: application.id, ats: 'Lever' }));
    } catch (err) {
      if (err instanceof DuplicateApplicationError) {
        return reply.code(409).send({ error: 'Already applied' });
      }
      throw err;
    }
  });
}
