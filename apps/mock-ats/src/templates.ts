/**
 * Shared HTML templates used across all ATS mock portals.
 */
import type { MockJob } from './data/jobs.js';

interface ApplyFormOpts {
  job: MockJob;
  action: string;
  atsLabel: string;
}

interface CaptchaOpts {
  job: MockJob;
  ats: string;
  board: string;
}

interface ConfirmationOpts {
  job: MockJob;
  applicationId: string;
  ats: string;
}

/** Generic apply form that mirrors the look of real career portals */
export function applyFormHtml({ job, action, atsLabel }: ApplyFormOpts): string {
  const customQHtml = job.customQuestions.map((q) => {
    const req = q.required ? ' required' : '';
    const reqLabel = q.required ? ' <span style="color:red">*</span>' : '';
    if (q.type === 'select' && q.options) {
      return `
      <div class="field">
        <label>${q.label}${reqLabel}</label>
        <select name="${q.id}"${req}>
          <option value="">— Select —</option>
          ${q.options.map((o) => `<option value="${o}">${o}</option>`).join('')}
        </select>
      </div>`;
    }
    if (q.type === 'textarea') {
      return `
      <div class="field">
        <label>${q.label}${reqLabel}</label>
        <textarea name="${q.id}" rows="4"${req}></textarea>
      </div>`;
    }
    if (q.type === 'checkbox') {
      return `
      <div class="field check">
        <input type="checkbox" id="${q.id}" name="${q.id}" value="true"${req} />
        <label for="${q.id}">${q.label}${reqLabel}</label>
      </div>`;
    }
    return `
    <div class="field">
      <label>${q.label}${reqLabel}</label>
      <input type="${q.type === 'number' ? 'number' : 'text'}" name="${q.id}"${req} />
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Apply – ${job.title} | ${atsLabel}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6f9; color: #333; }
    header { background: #1a56db; color: #fff; padding: 14px 32px; display:flex; align-items:center; gap:12px; }
    header h1 { font-size: 18px; font-weight: 600; }
    .badge { background: rgba(255,255,255,.2); border-radius: 4px; padding: 2px 8px; font-size: 12px; }
    .container { max-width: 720px; margin: 32px auto; padding: 0 16px 80px; }
    .card { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 4px rgba(0,0,0,.1); margin-bottom: 24px; }
    .job-meta { color: #555; font-size: 14px; margin-bottom: 24px; }
    .job-meta span { margin-right: 16px; }
    h2 { font-size: 22px; color: #1a56db; margin-bottom: 6px; }
    h3 { font-size: 16px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
    .field { margin-bottom: 18px; }
    .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #374151; }
    .field input, .field select, .field textarea {
      width: 100%; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 6px;
      font-size: 14px; transition: border-color .15s;
    }
    .field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: #1a56db; box-shadow: 0 0 0 3px rgba(26,86,219,.15); }
    .field.check { display: flex; align-items: center; gap: 10px; }
    .field.check input { width: auto; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .submit-btn {
      width: 100%; padding: 12px; background: #1a56db; color: #fff; border: none;
      border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background .15s;
    }
    .submit-btn:hover { background: #1648c0; }
    .required-note { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
  </style>
</head>
<body>
  <header>
    <h1>${atsLabel} Careers</h1>
    <span class="badge">${job.company}</span>
  </header>
  <div class="container">
    <div class="card">
      <h2>${job.title}</h2>
      <div class="job-meta">
        <span>🏢 ${job.company}</span>
        <span>📍 ${job.location}</span>
        <span>🏛️ ${job.department}</span>
        ${job.remote ? '<span>🌐 Remote</span>' : ''}
        ${job.salary ? `<span>💰 ${job.salary.currency} ${job.salary.min.toLocaleString()}–${job.salary.max.toLocaleString()}</span>` : ''}
      </div>

      <form id="apply-form" method="POST" action="${action}" enctype="multipart/form-data" novalidate>
        <h3>Personal Information</h3>
        <p class="required-note">Fields marked <span style="color:red">*</span> are required.</p>
        <div class="two-col">
          <div class="field">
            <label>First Name <span style="color:red">*</span></label>
            <input type="text" name="first_name" id="first_name" required placeholder="Jane" autocomplete="given-name" />
          </div>
          <div class="field">
            <label>Last Name <span style="color:red">*</span></label>
            <input type="text" name="last_name" id="last_name" required placeholder="Doe" autocomplete="family-name" />
          </div>
        </div>
        <div class="field">
          <label>Email Address <span style="color:red">*</span></label>
          <input type="email" name="email" id="email" required placeholder="jane@example.com" autocomplete="email" />
        </div>
        <div class="field">
          <label>Phone Number</label>
          <input type="tel" name="phone" placeholder="+1 555 000 0000" autocomplete="tel" />
        </div>
        <div class="field">
          <label>LinkedIn URL</label>
          <input type="url" name="linkedin" placeholder="https://linkedin.com/in/..." />
        </div>

        <h3 style="margin-top:28px">Resume & Cover Letter</h3>
        <div class="field">
          <label>Resume / CV <span style="color:red">*</span></label>
          <input type="file" name="resume" id="resume" accept=".pdf,.doc,.docx,.txt" required />
        </div>
        <div class="field">
          <label>Cover Letter</label>
          <textarea name="cover_letter" id="cover_letter" rows="6" placeholder="Tell us why you're excited about this role…"></textarea>
        </div>

        ${job.customQuestions.length > 0 ? `
        <h3 style="margin-top:28px">Additional Questions</h3>
        ${customQHtml}` : ''}

        <button class="submit-btn" type="submit" id="submit-btn">Submit Application</button>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('apply-form').addEventListener('submit', function(e) {
      var btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting…';
    });
  </script>
</body>
</html>`;
}

/** Simulated CAPTCHA / bot-detection challenge page */
export function captchaHtml({ job, ats, board }: CaptchaOpts): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Security Check | ${job.company}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .box { background:#fff; border-radius:12px; padding:48px 40px; text-align:center; max-width:400px; box-shadow:0 4px 24px rgba(0,0,0,.12); }
    h2 { color: #1a1a1a; margin-bottom:12px; }
    p { color:#555; margin-bottom:28px; font-size:14px; }
    .captcha-widget { border:2px solid #ccc; border-radius:8px; padding:24px; margin-bottom:24px; background:#f9f9f9; }
    .captcha-widget .check-row { display:flex; align-items:center; gap:12px; }
    .captcha-widget input[type=checkbox] { width:22px; height:22px; cursor:pointer; }
    .captcha-widget label { font-size:15px; color:#333; cursor:pointer; }
    .logo { font-size:12px; color:#999; text-align:right; margin-top:8px; }
    button { background:#1a56db; color:#fff; border:none; padding:12px 32px; border-radius:6px; font-size:15px; cursor:pointer; width:100%; }
    button:hover { background:#1648c0; }
    .note { font-size:11px; color:#aaa; margin-top:16px; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Security Verification</h2>
    <p>Before you can apply to <strong>${job.title}</strong> at <strong>${job.company}</strong>, please complete the security check below.</p>
    <div class="captcha-widget">
      <div class="check-row">
        <input type="checkbox" id="human-check" />
        <label for="human-check">I'm not a robot</label>
      </div>
      <div class="logo">reCAPTCHA · Privacy · Terms</div>
    </div>
    <button onclick="alert('This is a simulated CAPTCHA page. In real testing, AutoApply routes this job to NEEDS_HUMAN status.')">Verify</button>
    <p class="note">Mock ATS: CAPTCHA simulation. Set MOCK_ATS_CAPTCHA=never to disable.</p>
  </div>
</body>
</html>`;
}

/** Application confirmation / thank-you page */
export function confirmationHtml({ job, applicationId, ats }: ConfirmationOpts): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Application Submitted | ${job.company}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f0fdf4; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .box { background:#fff; border-radius:16px; padding:48px 40px; text-align:center; max-width:480px; box-shadow:0 4px 24px rgba(0,0,0,.1); }
    .icon { font-size:64px; margin-bottom:16px; }
    h2 { color:#16a34a; margin-bottom:8px; }
    p { color:#555; margin-bottom:8px; font-size:14px; }
    .app-id { font-family:monospace; background:#f1f5f9; border-radius:4px; padding:6px 12px; font-size:13px; color:#475569; display:inline-block; margin:12px 0; }
    a { color:#1a56db; text-decoration:none; font-size:14px; }
    .meta { margin-top:24px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:13px; color:#9ca3af; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">✅</div>
    <h2>Application Submitted!</h2>
    <p>Thank you for applying to <strong>${job.title}</strong> at <strong>${job.company}</strong>.</p>
    <p>We'll be in touch if your profile matches our requirements.</p>
    <div class="app-id">Application ID: ${applicationId}</div>
    <div class="meta">
      <p>ATS: ${ats} · Posted by Mock-ATS</p>
      <a href="/admin/applications">View in Admin Dashboard →</a>
    </div>
  </div>
</body>
</html>`;
}
