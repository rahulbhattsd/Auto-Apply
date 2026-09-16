/**
 * Admin dashboard routes
 * GET /admin              — redirect to /admin/jobs
 * GET /admin/jobs         — HTML table of all seeded jobs
 * GET /admin/applications — HTML table of all submitted applications
 * POST /admin/jobs        — add a job at runtime (JSON)
 * DELETE /admin/applications — clear all applications (for test resets)
 */
import type { FastifyInstance } from 'fastify';
import { getAllJobs, getApplications, addJob } from '../store.js';
import type { MockJob } from '../data/jobs.js';

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} | Mock-ATS Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    header { background: #1e293b; padding: 16px 32px; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 20px; }
    header h1 { font-size: 18px; color: #f8fafc; }
    nav a { color: #94a3b8; text-decoration: none; font-size: 14px; padding: 6px 14px; border-radius: 6px; transition: background .15s; }
    nav a:hover, nav a.active { background: #334155; color: #f1f5f9; }
    .container { max-width: 1200px; margin: 32px auto; padding: 0 24px; }
    h2 { font-size: 20px; color: #f1f5f9; margin-bottom: 20px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    .stat .num { font-size: 32px; font-weight: 700; color: #38bdf8; }
    .stat .label { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; }
    thead { background: #0f172a; }
    th { padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
    td { padding: 12px 16px; font-size: 13px; border-top: 1px solid #334155; vertical-align: top; }
    td a { color: #38bdf8; text-decoration: none; }
    td a:hover { text-decoration: underline; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-green { background: #166534; color: #bbf7d0; }
    .badge-blue { background: #1e40af; color: #bfdbfe; }
    .badge-purple { background: #581c87; color: #e9d5ff; }
    .badge-yellow { background: #713f12; color: #fef08a; }
    .badge-red { background: #7f1d1d; color: #fecaca; }
    .badge-gray { background: #374151; color: #d1d5db; }
    .empty { text-align:center; padding: 48px; color: #64748b; }
    .reset-btn { display:inline-block; background:#7f1d1d; color:#fecaca; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:13px; margin-bottom:20px; }
    .reset-btn:hover { background:#991b1b; }
  </style>
</head>
<body>
  <header>
    <h1>🧪 Mock-ATS Admin</h1>
    <nav>
      <a href="/admin/jobs">Jobs</a>
      <a href="/admin/applications">Applications</a>
      <a href="/admin/api-docs">API Docs</a>
    </nav>
  </header>
  <div class="container">${body}</div>
</body>
</html>`;
}

const ATS_BADGE: Record<string, string> = {
  greenhouse: 'badge-green',
  lever: 'badge-blue',
  workday: 'badge-purple',
  ashby: 'badge-yellow',
  workable: 'badge-red',
  darwinbox: 'badge-gray',
};

export async function adminRoutes(app: FastifyInstance) {

  app.get('/admin', async (_req, reply) => reply.redirect('/admin/jobs'));

  // ── Jobs dashboard ──────────────────────────────────────────────────────────
  app.get('/admin/jobs', async (_req, reply) => {
    const jobs = getAllJobs();
    const port = process.env.MOCK_ATS_PORT || 4000;

    const rows = jobs.map((j) => {
      const applyUrl = buildApplyUrl(j, port);
      return `<tr>
        <td><span class="badge ${ATS_BADGE[j.ats] ?? 'badge-gray'}">${j.ats}</span></td>
        <td><strong>${j.title}</strong><br/><small style="color:#64748b">${j.id}</small></td>
        <td>${j.company}</td>
        <td>${j.location}${j.remote ? ' 🌐' : ''}</td>
        <td>${j.department}</td>
        <td>${j.salary ? `${j.salary.currency} ${j.salary.min.toLocaleString()}–${j.salary.max.toLocaleString()}` : '—'}</td>
        <td>
          <a href="${applyUrl}" target="_blank">Apply Form ↗</a><br/>
          <a href="/admin/applications?job=${j.id}" style="color:#94a3b8">Filter Apps</a>
        </td>
      </tr>`;
    }).join('');

    const atsCounts = jobs.reduce<Record<string, number>>((acc, j) => {
      acc[j.ats] = (acc[j.ats] ?? 0) + 1; return acc;
    }, {});

    const stats = Object.entries(atsCounts).map(([ats, count]) =>
      `<div class="stat"><div class="num">${count}</div><div class="label">${ats} jobs</div></div>`
    ).join('');

    const body = `
      <h2>All Jobs (${jobs.length})</h2>
      <div class="stat-grid">${stats}</div>
      <table>
        <thead><tr>
          <th>ATS</th><th>Title / ID</th><th>Company</th><th>Location</th><th>Department</th><th>Salary</th><th>Links</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    return reply.type('text/html').send(layout('Jobs', body));
  });

  // ── Applications dashboard ──────────────────────────────────────────────────
  app.get('/admin/applications', async (req, reply) => {
    const { job: jobFilter } = (req.query as Record<string, string>);
    let apps = getApplications();
    if (jobFilter) apps = apps.filter((a) => a.jobId === jobFilter);

    const rows = apps.length === 0
      ? `<tr><td colspan="7" class="empty">No applications submitted yet.</td></tr>`
      : apps.map((a) => {
          const email = a.fields['email'] ?? '—';
          const name = [a.fields['first_name'], a.fields['last_name']].filter(Boolean).join(' ') || '—';
          return `<tr>
            <td><small style="font-family:monospace;color:#64748b">${a.id}</small></td>
            <td><span class="badge ${ATS_BADGE[a.ats] ?? 'badge-gray'}">${a.ats}</span></td>
            <td>${a.jobId}</td>
            <td>${name}</td>
            <td>${email}</td>
            <td>${a.resumeFilename ? `📄 ${a.resumeFilename}` : '—'}</td>
            <td style="color:#64748b;font-size:12px">${new Date(a.submittedAt).toLocaleString()}</td>
          </tr>`;
        }).join('');

    const body = `
      <h2>Submitted Applications (${apps.length})</h2>
      <form method="POST" action="/admin/applications/clear" style="margin-bottom:16px">
        <button class="reset-btn" type="submit" onclick="return confirm('Clear all applications?')">🗑 Clear All Applications</button>
      </form>
      <table>
        <thead><tr>
          <th>App ID</th><th>ATS</th><th>Job ID</th><th>Candidate</th><th>Email</th><th>Resume</th><th>Submitted At</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    return reply.type('text/html').send(layout('Applications', body));
  });

  // POST /admin/applications/clear  — reset state for test runs
  app.post('/admin/applications/clear', async (_req, reply) => {
    // We can't re-import the set, so we expose a clear helper
    const { _clearApplications } = await import('../store.js') as any;
    if (typeof _clearApplications === 'function') _clearApplications();
    return reply.redirect('/admin/applications');
  });

  // POST /admin/jobs  — add a job dynamically (for test setup)
  app.post('/admin/jobs', async (req, reply) => {
    const job = req.body as MockJob;
    if (!job?.id || !job?.title || !job?.ats) {
      return reply.code(400).send({ error: 'id, title, and ats are required' });
    }
    addJob(job);
    return reply.code(201).send({ ok: true, id: job.id });
  });

  // GET /admin/api-docs  — quick reference of all endpoints
  app.get('/admin/api-docs', async (_req, reply) => {
    const port = process.env.MOCK_ATS_PORT || 4000;
    const base = `http://localhost:${port}`;
    const endpoints = [
      ['GET', `/greenhouse/:board/jobs`, 'JSON job listing'],
      ['GET', `/greenhouse/:board/jobs/:id`, 'JSON job detail'],
      ['GET', `/greenhouse/:board/jobs/:id/apply`, 'HTML apply form'],
      ['POST', `/greenhouse/:board/jobs/:id/apply`, 'Submit application (multipart)'],
      ['GET', `/lever/:company/jobs`, 'JSON listing'],
      ['GET', `/lever/:company/jobs/:id/apply`, 'HTML apply form'],
      ['POST', `/lever/:company/jobs/:id/apply`, 'Submit (multipart or JSON)'],
      ['GET', `/workday/:tenant/jobs`, 'HTML job listing'],
      ['GET', `/workday/:tenant/jobs.json`, 'JSON job listing'],
      ['GET', `/workday/:tenant/apply/:id/step1`, 'HTML step 1 form'],
      ['POST', `/workday/:tenant/apply/:id/step2`, 'Advance to step 2'],
      ['POST', `/workday/:tenant/apply/:id/submit`, 'Final submit (multipart)'],
      ['GET', `/ashby/:company/jobs`, 'JSON listing'],
      ['GET', `/ashby/:company/jobs/:id/apply`, 'HTML apply form'],
      ['POST', `/ashby/:company/jobs/:id/apply`, 'Submit (JSON or multipart)'],
      ['GET', `/workable/:company/jobs`, 'JSON listing'],
      ['GET', `/workable/:company/j/:id/apply`, 'HTML apply form'],
      ['POST', `/workable/:company/j/:id/apply`, 'Submit (JSON or multipart)'],
      ['GET', `/darwinbox/:tenant/jobs`, 'JSON listing'],
      ['GET', `/darwinbox/:tenant/recruitment/apply/:id`, 'HTML apply form'],
      ['POST', `/darwinbox/:tenant/recruitment/apply/:id`, 'Submit (multipart or JSON)'],
      ['GET', `/admin/jobs`, 'Admin: job dashboard'],
      ['GET', `/admin/applications`, 'Admin: applications dashboard'],
      ['POST', `/admin/jobs`, 'Admin: seed a job (JSON body)'],
      ['POST', `/admin/applications/clear`, 'Admin: clear all submitted applications'],
    ];
    const rows = endpoints.map(([method, path, desc]) =>
      `<tr><td><span class="badge badge-blue">${method}</span></td><td><code style="color:#7dd3fc">${base}${path}</code></td><td style="color:#94a3b8">${desc}</td></tr>`
    ).join('');
    const body = `<h2>API Reference</h2>
    <p style="color:#64748b;margin-bottom:20px;font-size:14px">All endpoints respond on <code style="color:#7dd3fc">${base}</code>. Set <code>MOCK_ATS_CAPTCHA=never</code> to disable CAPTCHA simulation.</p>
    <table><thead><tr><th>Method</th><th>URL</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
    return reply.type('text/html').send(layout('API Docs', body));
  });
}

function buildApplyUrl(job: MockJob, port: string | number): string {
  const base = `http://localhost:${port}`;
  switch (job.ats) {
    case 'greenhouse': return `${base}/greenhouse/${job.tenant}/jobs/${job.id}/apply`;
    case 'lever':      return `${base}/lever/${job.tenant}/jobs/${job.id}/apply`;
    case 'workday':    return `${base}/workday/${job.tenant}/apply/${job.id}/step1`;
    case 'ashby':      return `${base}/ashby/${job.tenant}/jobs/${job.id}/apply`;
    case 'workable':   return `${base}/workable/${job.tenant}/j/${job.id}/apply`;
    case 'darwinbox':  return `${base}/darwinbox/${job.tenant}/recruitment/apply/${job.id}`;
    default:           return `${base}/admin/jobs`;
  }
}
