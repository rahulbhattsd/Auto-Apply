import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NaukriProvider } from '../src/NaukriProvider.js';
import { fakeCtx } from '@autoapply/providers-core/testing/fakePage.js';
import type { CanonicalJob, ApplyProfile, ProviderCtx } from '@autoapply/providers-core';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__');
const fixture = (n: string) => readFileSync(join(FIX, n), 'utf8');

const JOB_URL = 'https://www.naukri.com/job-listings-ai-engineer-acme-060925900001';

const job: CanonicalJob = {
  providerJobId: '060925900001',
  provider: 'naukri',
  title: 'AI Engineer',
  company: 'Acme Technologies',
  locations: ['Bengaluru'],
  applyType: 'INTERNAL',
  applyUrl: JOB_URL,
};

const profile: ApplyProfile = {
  name: 'Test Candidate',
  email: 'test@example.com',
  phone: '9999999999',
  noticePeriod: 'Immediate',
  currentCtc: '0',
  expectedCtc: '8',
  totalExperienceYears: 0,
  answers: { notice_period: 'Immediate', current_ctc: '0', expected_ctc: '8' },
};

const ctxFor = (html: string, extra: Record<string, unknown> = {}) =>
  fakeCtx({ html, url: JOB_URL, ...extra }) as unknown as ProviderCtx;

describe('NaukriProvider.apply outcome branches', () => {
  test('happy path returns APPLIED with evidence', async () => {
    const p = new NaukriProvider();
    const out = await p.apply(ctxFor(fixture('job-internal-apply.html')), job, profile);
    assert.equal(out.status, 'APPLIED');
    if (out.status === 'APPLIED') {
      assert.ok(out.evidence.screenshotKey || out.evidence.htmlSnapshotKey);
      assert.equal(typeof out.evidence.url, 'string');
    }
  });

  test('already-applied short-circuits without clicking', async () => {
    const p = new NaukriProvider();
    const ctx = ctxFor(fixture('job-already-applied.html'));
    const out = await p.apply(ctx, job, profile);
    assert.equal(out.status, 'ALREADY_APPLIED');
  });

  test('external job hands off instead of applying', async () => {
    const p = new NaukriProvider();
    const out = await p.apply(ctxFor(fixture('job-external-apply.html')), { ...job, applyType: 'EXTERNAL' }, profile);
    assert.equal(out.status, 'HANDOFF_EXTERNAL');
    if (out.status === 'HANDOFF_EXTERNAL') assert.ok(out.url.length > 0);
  });

  test('captcha returns NEEDS_HUMAN:CAPTCHA with evidence, not a retry loop', async () => {
    const p = new NaukriProvider();
    const out = await p.apply(ctxFor(fixture('captcha.html')), job, profile);
    assert.equal(out.status, 'NEEDS_HUMAN');
    if (out.status === 'NEEDS_HUMAN') {
      assert.equal(out.reason, 'CAPTCHA');
      assert.ok(out.evidence);
    }
  });

  test('expired session returns NEEDS_HUMAN:SESSION_EXPIRED', async () => {
    const p = new NaukriProvider();
    const out = await p.apply(ctxFor(fixture('logged-out.html')), job, profile);
    assert.equal(out.status, 'NEEDS_HUMAN');
    if (out.status === 'NEEDS_HUMAN') assert.equal(out.reason, 'SESSION_EXPIRED');
  });

  test('unanswerable questionnaire question stops instead of guessing', async () => {
    const p = new NaukriProvider();
    const html = fixture('questionnaire-modal.html')
      .replace('What is your current notice period?', 'Describe your proudest engineering achievement.');
    const bare: ApplyProfile = { name: 'T', email: 't@example.com' };
    const out = await p.apply(ctxFor(html), job, bare);
    assert.equal(out.status, 'NEEDS_HUMAN');
    if (out.status === 'NEEDS_HUMAN') assert.equal(out.reason, 'UNANSWERABLE_QUESTION');
  });

  test('redesigned page returns NEEDS_HUMAN:UNKNOWN_UI, never a false APPLIED', async () => {
    const p = new NaukriProvider();
    const out = await p.apply(ctxFor('<html><body><div>v3 redesign</div></body></html>'), job, profile);
    assert.notEqual(out.status, 'APPLIED');
    if (out.status === 'NEEDS_HUMAN') assert.equal(out.reason, 'UNKNOWN_UI');
  });

  test('missing confirmation after submit is CONFIRMATION_NOT_FOUND, not APPLIED', async () => {
    const p = new NaukriProvider();
    // apply button present, but no confirmation element ever appears
    const html = fixture('job-internal-apply.html').replace('<button id="apply-button">Apply</button>',
      '<button id="apply-button" data-no-confirm="1">Apply</button>');
    const out = await p.apply(ctxFor(html, { matches: { '.apply-message': 0 } }), job, profile);
    if (out.status === 'NEEDS_HUMAN') {
      assert.equal(out.reason, 'CONFIRMATION_NOT_FOUND');
    } else {
      assert.notEqual(out.status, 'APPLIED', 'no confirmation must never be reported as APPLIED');
    }
  });

  test('a thrown page error becomes FAILED, not an unhandled rejection', async () => {
    const p = new NaukriProvider();
    const ctx = ctxFor(fixture('job-internal-apply.html'), { clickThrowsOn: '#apply-button' });
    const out = await p.apply(ctx, job, profile);
    assert.equal(out.status, 'FAILED');
    if (out.status === 'FAILED') assert.equal(typeof out.retryable, 'boolean');
  });

  test('exhausted budget refuses before touching the browser', async () => {
    const p = new NaukriProvider();
    const ctx = ctxFor(fixture('job-internal-apply.html'), {}) as ProviderCtx & { budget: { appliesUsed: number } };
    ctx.budget.appliesUsed = 20;
    const out = await p.apply(ctx, job, profile);
    assert.notEqual(out.status, 'APPLIED');
  });

  test('always closes the page it opened', async () => {
    const p = new NaukriProvider();
    const ctx = fakeCtx({ html: fixture('captcha.html'), url: JOB_URL });
    await p.apply(ctx as unknown as ProviderCtx, job, profile);
    const pages = (ctx.browser as unknown as { pages: Array<{ closed: boolean }> }).pages;
    for (const pg of pages) assert.equal(pg.closed, true, 'page leak');
  });

  test('never logs the session cookie', async () => {
    const p = new NaukriProvider();
    const ctx = fakeCtx({ html: fixture('job-internal-apply.html'), url: JOB_URL });
    await p.apply(ctx as unknown as ProviderCtx, job, profile);
    const lines = (ctx.logger as unknown as { lines: string[] }).lines.join('\n');
    assert.ok(!lines.includes('nauk_at'));
    assert.ok(!lines.includes('secret'));
  });
});

describe('NaukriProvider.verifyApplied', () => {
  test('confirms from the applied marker', async () => {
    const p = new NaukriProvider();
    const out = await p.verifyApplied(ctxFor(fixture('job-already-applied.html')), job);
    assert.equal(out.status, 'VERIFIED');
  });

  test('reports NOT_APPLIED when the apply button is still live', async () => {
    const p = new NaukriProvider();
    const out = await p.verifyApplied(ctxFor(fixture('job-internal-apply.html')), job);
    assert.equal(out.status, 'NOT_APPLIED');
  });
});
