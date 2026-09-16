/**
 * Darwinbox-style routes
 * Real URL pattern: https://{tenant}.darwinbox.in/recruitment/...
 * Mock: http://localhost:4000/darwinbox/{tenant}/jobs
 */
import type { FastifyInstance } from 'fastify';
import {
  getJobsByAts, getJobById, submitApplication, checkRateLimit,
  shouldShowCaptcha, DuplicateApplicationError,
} from '../store.js';
import { applyFormHtml, captchaHtml, confirmationHtml } from '../templates.js';

export async function darwinboxRoutes(app: FastifyInstance) {

  // GET /darwinbox/:tenant/jobs  — JSON listing
  app.get('/darwinbox/:tenant/jobs', async (req, reply) => {
    const { tenant } = req.params as { tenant: string };
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ status: 'error', message: 'Too many requests' });
    const port = process.env.MOCK_ATS_PORT || 4000;
    const jobs = getJobsByAts('darwinbox', tenant);
    return reply.send({
      status: 'success',
      data: jobs.map((j) => ({
        job_id: j.id,
        job_title: j.title,
        department: j.department,
        location: j.location,
        remote: j.remote,
        posted_on: j.postedAt,
        expires_on: j.expiresAt,
        job_url: `http://localhost:${port}/darwinbox/${tenant}/recruitment/job-detail/${j.id}`,
        apply_url: `http://localhost:${port}/darwinbox/${tenant}/recruitment/apply/${j.id}`,
        salary: j.salary ? { min: j.salary.min, max: j.salary.max, currency: j.salary.currency } : null,
      })),
    });
  });

  // GET /darwinbox/:tenant/recruitment/job-detail/:id  — HTML job detail
  app.get('/darwinbox/:tenant/recruitment/job-detail/:id', async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Vacancy not found</h1>');
    return reply.type('text/html').send(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${job.title} – ${job.company} | Darwinbox</title>
    <style>body{font-family:Roboto,Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px}
    h1{color:#3a3a7c}.apply-btn{background:#3a3a7c;color:#fff;padding:10px 24px;text-decoration:none;border-radius:4px;display:inline-block;margin-top:16px}
    </style></head>
    <body>
    <h1>${job.title}</h1>
    <p><strong>${job.company}</strong> · ${job.department} · ${job.location}</p>
    ${job.salary ? `<p>Salary: ${job.salary.currency} ${job.salary.min.toLocaleString()} – ${job.salary.max.toLocaleString()}</p>` : ''}
    <h3>About the Role</h3><pre style="white-space:pre-wrap">${job.description}</pre>
    <h3>Requirements</h3><ul>${job.requirements.map((r) => `<li>${r}</li>`).join('')}</ul>
    <a class="apply-btn" href="/darwinbox/${tenant}/recruitment/apply/${id}">Apply Now</a>
    </body></html>`);
  });

  // GET /darwinbox/:tenant/recruitment/apply/:id  — HTML apply form
  app.get('/darwinbox/:tenant/recruitment/apply/:id', async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Not found</h1>');
    if (shouldShowCaptcha(id)) {
      return reply.type('text/html').send(captchaHtml({ job, ats: 'darwinbox', board: tenant }));
    }
    return reply.type('text/html').send(
      applyFormHtml({ job, action: `/darwinbox/${tenant}/recruitment/apply/${id}`, atsLabel: 'Darwinbox' })
    );
  });

  // POST /darwinbox/:tenant/recruitment/apply/:id  — submit
  app.post('/darwinbox/:tenant/recruitment/apply/:id', async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send({ status: 'error', message: 'Vacancy not found' });
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ status: 'error', message: 'Rate limit exceeded' });

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

    try {
      const application = submitApplication({
        jobId: id, ats: 'darwinbox', tenant, fields, resumeFilename, coverLetter, ip: req.ip,
      });
      if (ct.includes('multipart')) {
        return reply.type('text/html').send(confirmationHtml({ job, applicationId: application.id, ats: 'Darwinbox' }));
      }
      return reply.code(201).send({ status: 'success', application_id: application.id });
    } catch (err) {
      if (err instanceof DuplicateApplicationError) {
        return reply.code(409).send({ status: 'error', message: 'Already applied' });
      }
      throw err;
    }
  });
}
