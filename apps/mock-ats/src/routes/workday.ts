/**
 * Workday-style routes
 * Real URL pattern: https://{tenant}.wd1.myworkdayjobs.com/en-US/{tenant}/job/...
 * Mock:            http://localhost:4000/workday/{tenant}/jobs
 *
 * Workday uses a multi-step apply flow; we simulate a 2-step HTML wizard.
 */
import type { FastifyInstance } from 'fastify';
import {
  getJobsByAts, getJobById, submitApplication, checkRateLimit,
  shouldShowCaptcha, DuplicateApplicationError,
} from '../store.js';
import { captchaHtml, confirmationHtml } from '../templates.js';

function workdayListHtml(tenant: string, jobs: any[]): string {
  const rows = jobs.map((j) => `
    <div class="job-card">
      <h3><a href="/workday/${tenant}/job/${j.id}">${j.title}</a></h3>
      <p>${j.location} · ${j.department} ${j.remote ? '· Remote' : ''}</p>
      <p>${j.description.slice(0, 120)}…</p>
      <a class="btn" href="/workday/${tenant}/apply/${j.id}/step1">Apply Now</a>
    </div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
  <title>${tenant} Careers | Workday</title>
  <style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#f5f5f5}
  .job-card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:20px;margin:16px 0}
  h3{margin:0 0 8px}a{color:#0072C6;text-decoration:none}.btn{display:inline-block;background:#0072C6;color:#fff;padding:8px 16px;border-radius:4px;margin-top:8px}
  header{background:#0072C6;color:#fff;padding:12px 20px;margin-bottom:24px;border-radius:8px}
  </style></head><body>
  <header><h2>${tenant.toUpperCase()} Careers</h2><p>Powered by Workday</p></header>
  ${rows || '<p>No open positions.</p>'}
  </body></html>`;
}

function workdayStep1Html(job: any, tenant: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
  <title>Apply – ${job.title} | Workday</title>
  <style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:0 20px}
  label{display:block;margin:12px 0 4px;font-weight:bold}input,textarea,select{width:100%;padding:8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}
  .btn{background:#0072C6;color:#fff;padding:10px 24px;border:none;border-radius:4px;cursor:pointer;font-size:16px;margin-top:16px}
  .step-indicator{color:#666;font-size:14px;margin-bottom:16px}.job-title{color:#0072C6}
  </style></head><body>
  <p class="step-indicator">Step 1 of 2 — Personal Information</p>
  <h2>Apply for: <span class="job-title">${job.title}</span></h2>
  <p>${job.company} · ${job.location}</p>
  <form method="POST" action="/workday/${tenant}/apply/${job.id}/step2" enctype="application/x-www-form-urlencoded">
    <label>First Name *<input name="first_name" required placeholder="Jane" /></label>
    <label>Last Name *<input name="last_name" required placeholder="Doe" /></label>
    <label>Email Address *<input name="email" type="email" required placeholder="jane@example.com" /></label>
    <label>Phone Number<input name="phone" type="tel" placeholder="+1 555 000 0000" /></label>
    <label>LinkedIn URL<input name="linkedin" type="url" placeholder="https://linkedin.com/in/..." /></label>
    <label>How did you hear about us?
      <select name="source">
        <option>LinkedIn</option><option>Job Board</option><option>Referral</option><option>Company Website</option><option>Other</option>
      </select>
    </label>
    <button class="btn" type="submit">Next →</button>
  </form>
  </body></html>`;
}

function workdayStep2Html(job: any, tenant: string, prevFields: string): string {
  const customQHtml = job.customQuestions.map((q: any) => {
    if (q.type === 'select') {
      return `<label>${q.label}${q.required ? ' *' : ''}
        <select name="${q.id}"${q.required ? ' required' : ''}>
          <option value="">Select…</option>
          ${q.options.map((o: string) => `<option>${o}</option>`).join('')}
        </select></label>`;
    }
    if (q.type === 'textarea') {
      return `<label>${q.label}${q.required ? ' *' : ''}<textarea name="${q.id}" rows="4"${q.required ? ' required' : ''}></textarea></label>`;
    }
    return `<label>${q.label}${q.required ? ' *' : ''}<input name="${q.id}" type="${q.type === 'number' ? 'number' : 'text'}"${q.required ? ' required' : ''} /></label>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
  <title>Apply – ${job.title} | Workday Step 2</title>
  <style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:0 20px}
  label{display:block;margin:12px 0 4px;font-weight:bold}input,textarea,select{width:100%;padding:8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}
  .btn{background:#0072C6;color:#fff;padding:10px 24px;border:none;border-radius:4px;cursor:pointer;font-size:16px;margin-top:16px}
  .step-indicator{color:#666;font-size:14px;margin-bottom:16px}
  </style></head><body>
  <p class="step-indicator">Step 2 of 2 — Resume & Questions</p>
  <h2>Apply for: ${job.title}</h2>
  <form method="POST" action="/workday/${tenant}/apply/${job.id}/submit" enctype="multipart/form-data">
    <input type="hidden" name="_prev" value="${encodeURIComponent(prevFields)}" />
    <label>Resume / CV *<input name="resume" type="file" accept=".pdf,.doc,.docx" required /></label>
    <label>Cover Letter<textarea name="cover_letter" rows="5" placeholder="Optional cover letter…"></textarea></label>
    ${customQHtml}
    <button class="btn" type="submit">Submit Application</button>
  </form>
  </body></html>`;
}

export async function workdayRoutes(app: FastifyInstance) {

  // GET /workday/:tenant/jobs  — HTML job listing
  app.get('/workday/:tenant/jobs', async (req, reply) => {
    const { tenant } = req.params as { tenant: string };
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).type('text/html').send('<h1>429 Too Many Requests</h1>');
    const jobs = getJobsByAts('workday', tenant);
    return reply.type('text/html').send(workdayListHtml(tenant, jobs));
  });

  // GET /workday/:tenant/jobs.json  — JSON for API-level tests
  app.get('/workday/:tenant/jobs.json', async (req, reply) => {
    const { tenant } = req.params as { tenant: string };
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Rate limit' });
    return reply.send({ jobPostings: getJobsByAts('workday', tenant).map((j) => ({ id: j.id, title: j.title, location: j.location, postedOn: j.postedAt })) });
  });

  // GET /workday/:tenant/job/:id  — job detail HTML
  app.get('/workday/:tenant/job/:id', async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Position not found</h1>');
    return reply.type('text/html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${job.title}</title></head>
    <body style="font-family:Arial;max-width:800px;margin:40px auto;padding:0 20px">
    <h1>${job.title}</h1><p>${job.company} · ${job.location}</p>
    <pre style="white-space:pre-wrap">${job.description}</pre>
    <a href="/workday/${tenant}/apply/${id}/step1" style="background:#0072C6;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Apply Now</a>
    </body></html>`);
  });

  // GET /workday/:tenant/apply/:id/step1  — personal info
  app.get('/workday/:tenant/apply/:id/step1', async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).type('text/html').send('<h1>Not found</h1>');
    if (shouldShowCaptcha(id)) {
      return reply.type('text/html').send(captchaHtml({ job, ats: 'workday', board: tenant }));
    }
    return reply.type('text/html').send(workdayStep1Html(job, tenant));
  });

  // POST /workday/:tenant/apply/:id/step2  — receive step1 data, show step2
  app.post('/workday/:tenant/apply/:id/step2', async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send('Not found');
    const body = (req.body as Record<string, string>) ?? {};
    const prev = new URLSearchParams(body).toString();
    return reply.type('text/html').send(workdayStep2Html(job, tenant, prev));
  });

  // POST /workday/:tenant/apply/:id/submit  — final multipart submit
  app.post('/workday/:tenant/apply/:id/submit', async (req, reply) => {
    const { tenant, id } = req.params as { tenant: string; id: string };
    const job = getJobById(id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    const rl = checkRateLimit(req.ip);
    if (rl.limited) return reply.code(429).send({ error: 'Rate limit' });

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
          if (part.fieldname === '_prev') {
            // merge previous step fields
            const prev = new URLSearchParams(decodeURIComponent(part.value as string));
            for (const [k, v] of prev.entries()) fields[k] = v;
          } else {
            fields[part.fieldname] = part.value as string;
          }
        }
      }
    } else {
      fields = (req.body as Record<string, string>) ?? {};
    }
    coverLetter = fields['cover_letter'];

    try {
      const application = submitApplication({
        jobId: id, ats: 'workday', tenant, fields, resumeFilename, coverLetter, ip: req.ip,
      });
      return reply.type('text/html').send(confirmationHtml({ job, applicationId: application.id, ats: 'Workday' }));
    } catch (err) {
      if (err instanceof DuplicateApplicationError) {
        return reply.code(409).type('text/html').send('<h1>You have already applied for this position.</h1>');
      }
      throw err;
    }
  });
}
