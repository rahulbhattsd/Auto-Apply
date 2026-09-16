/**
 * Workable-style routes
 * Real URL pattern: https://{company}.workable.com/j/{id}
 * Workable uses a JSON API + HTML apply page.
 * Mock: http://localhost:4000/workable/{company}/jobs
 */
import type { FastifyInstance } from 'fastify';
import {
  getJobsByAts, getJobById, submitApplication, checkRateLimit,
  shouldShowCaptcha, DuplicateApplicationError,
} from '../store.js';
import { applyFormHtml, captchaHtml, confirmationHtml } from '../templates.js';

export async function workableRoutes(app: FastifyInstance) {

  // GET /workable/:company/jobs  — JSON listing
  app.get('/workable/:company/jobs', async (req, reply) => {
    const { company } = req.params as { company: string };
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Too Many Requests' });
    const port = process.env.MOCK_ATS_PORT || 4000;
    const jobs = getJobsByAts('workable', company);
    return reply.send({
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        department: j.department,
        location: { city: j.location, country: 'US', telecommuting: j.remote },
        created_at: j.postedAt,
        url: `http://localhost:${port}/workable/${company}/j/${j.id}`,
        application_url: `http://localhost:${port}/workable/${company}/j/${j.id}/apply`,
        shortcode: j.id.replace('wk-', 'WK'),
      })),
      paging: { next: null },
    });
  });

  // GET /workable/:company/j/:id  — HTML job listing page
  app.get('/workable/:company/j/:id', async (req, reply) => {
    const { company, id } = req.params as { company: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Job not found</h1>');
    return reply.type('text/html').send(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${job.title} – ${job.company}</title></head>
    <body style="font-family:Arial;max-width:800px;margin:40px auto;padding:0 20px">
    <h1>${job.title}</h1><p>${job.company} · ${job.location}</p>
    <pre style="white-space:pre-wrap">${job.description}</pre>
    <hr/><h3>Requirements</h3><ul>${job.requirements.map((r) => `<li>${r}</li>`).join('')}</ul>
    <a href="/workable/${company}/j/${id}/apply" style="background:#1abc9c;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Apply for this job</a>
    </body></html>`);
  });

  // GET /workable/:company/j/:id/apply  — HTML form
  app.get('/workable/:company/j/:id/apply', async (req, reply) => {
    const { company, id } = req.params as { company: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Not found</h1>');
    if (shouldShowCaptcha(id)) {
      return reply.type('text/html').send(captchaHtml({ job, ats: 'workable', board: company }));
    }
    return reply.type('text/html').send(
      applyFormHtml({ job, action: `/workable/${company}/j/${id}/apply`, atsLabel: 'Workable' })
    );
  });

  // POST /workable/:company/j/:id/apply  — submit (JSON or multipart)
  app.post('/workable/:company/j/:id/apply', async (req, reply) => {
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
      // Workable JSON API: { firstname, lastname, email, resume: {name, data}, answers: [{question_key, body}] }
      const body = (req.body as any) ?? {};
      fields = {
        first_name: body.firstname ?? '',
        last_name: body.lastname ?? '',
        email: body.email ?? '',
        phone: body.phone ?? '',
      };
      if (Array.isArray(body.answers)) {
        for (const a of body.answers) {
          fields[a.question_key] = a.body;
        }
      }
      resumeFilename = body?.resume?.name;
      coverLetter = body.summary;
    }
    coverLetter = coverLetter ?? fields['cover_letter'];

    try {
      const application = submitApplication({
        jobId: id, ats: 'workable', tenant: company, fields, resumeFilename, coverLetter, ip: req.ip,
      });
      if (ct.includes('multipart')) {
        return reply.type('text/html').send(confirmationHtml({ job, applicationId: application.id, ats: 'Workable' }));
      }
      return reply.code(201).send({ status: 'success', id: application.id });
    } catch (err) {
      if (err instanceof DuplicateApplicationError) {
        return reply.code(409).send({ status: 'error', code: 'DUPLICATE' });
      }
      throw err;
    }
  });
}
