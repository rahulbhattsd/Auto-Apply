/**
 * Ashby-style routes
 * Real URL pattern: https://jobs.ashbyhq.com/{company}
 * Ashby uses a JSON API for listing + detail, and a JSON POST for apply.
 * Mock: http://localhost:4000/ashby/{company}/jobs
 */
import type { FastifyInstance } from 'fastify';
import {
  getJobsByAts, getJobById, submitApplication, checkRateLimit,
  DuplicateApplicationError,
} from '../store.js';
import { applyFormHtml, confirmationHtml } from '../templates.js';

export async function ashbyRoutes(app: FastifyInstance) {

  // GET /ashby/:company/jobs  — JSON listing
  app.get('/ashby/:company/jobs', async (req, reply) => {
    const { company } = req.params as { company: string };
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Rate limited' });
    const jobs = getJobsByAts('ashby', company);
    return reply.send({
      results: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        departmentName: j.department,
        locationName: j.location,
        isRemote: j.remote,
        publishedDate: j.postedAt,
        jobUrl: `http://localhost:${process.env.MOCK_ATS_PORT || 4000}/ashby/${company}/jobs/${j.id}`,
        applicationFormDefinition: {
          sections: [
            {
              fields: j.customQuestions.map((q) => ({
                field: { type: q.type, path: q.id, title: q.label, isRequired: q.required, selectableValues: q.options?.map((o) => ({ label: o, value: o })) },
              })),
            },
          ],
        },
      })),
      moreDataAvailable: false,
    });
  });

  // GET /ashby/:company/jobs/:id  — JSON job detail
  app.get('/ashby/:company/jobs/:id', async (req, reply) => {
    const { company, id } = req.params as { company: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    return reply.send({
      id: job.id,
      title: job.title,
      descriptionHtml: `<p>${job.description.replace(/\n/g, '<br>')}</p>`,
      locationName: job.location,
      isRemote: job.remote,
      employmentType: 'FullTime',
      publishedDate: job.postedAt,
      jobUrl: `http://localhost:${process.env.MOCK_ATS_PORT || 4000}/ashby/${company}/jobs/${job.id}`,
    });
  });

  // GET /ashby/:company/jobs/:id/apply  — HTML form (for Playwright)
  app.get('/ashby/:company/jobs/:id/apply', async (req, reply) => {
    const { company, id } = req.params as { company: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Not found</h1>');
    return reply.type('text/html').send(
      applyFormHtml({ job, action: `/ashby/${company}/jobs/${id}/apply`, atsLabel: 'Ashby' })
    );
  });

  // POST /ashby/:company/jobs/:id/apply  — JSON submit (primary) or multipart
  app.post('/ashby/:company/jobs/:id/apply', async (req, reply) => {
    const { company, id } = req.params as { company: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Rate limited' });

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
      // Ashby expects JSON: { applicationForm: { fieldSubmissions: [{path, value}] }, resume: { filename, content } }
      const body = (req.body as any) ?? {};
      if (Array.isArray(body?.applicationForm?.fieldSubmissions)) {
        for (const sub of body.applicationForm.fieldSubmissions) {
          fields[sub.path] = sub.value;
        }
      } else {
        fields = body;
      }
      resumeFilename = body?.resume?.filename;
      coverLetter = body?.coverLetter ?? fields['cover_letter'];
    }
    coverLetter = coverLetter ?? fields['cover_letter'];

    try {
      const application = submitApplication({
        jobId: id, ats: 'ashby', tenant: company, fields, resumeFilename, coverLetter, ip: req.ip,
      });
      if (ct.includes('multipart')) {
        return reply.type('text/html').send(confirmationHtml({ job, applicationId: application.id, ats: 'Ashby' }));
      }
      return reply.code(201).send({ success: true, applicationId: application.id });
    } catch (err) {
      if (err instanceof DuplicateApplicationError) {
        return reply.code(409).send({ success: false, error: 'DUPLICATE_APPLICATION' });
      }
      throw err;
    }
  });
}
