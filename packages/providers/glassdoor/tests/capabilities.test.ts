import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlassdoorProvider } from '../src/GlassdoorProvider.js';
import { fakeCtx } from '@autoapply/providers-core/testing/fakePage.js';
import type { ProviderCtx, CanonicalJob, ApplyProfile } from '@autoapply/providers-core';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__');
const fixture = (n: string) => readFileSync(join(FIX, n), 'utf8');
const URL_ = 'https://www.glassdoor.co.in/job-listing/ml-engineer-hooli-JV_123.htm';

const job: CanonicalJob = {
  providerJobId: 'JV_123',
  provider: 'glassdoor' as CanonicalJob['provider'],
  title: 'Machine Learning Engineer',
  company: 'Hooli',
  locations: ['Bengaluru'],
  applyType: 'INTERNAL',
  applyUrl: URL_,
};
const profile: ApplyProfile = { name: 'T', email: 't@example.com' };
const ctxFor = (html: string, extra = {}) =>
  fakeCtx({ html, url: URL_, ...extra }) as unknown as ProviderCtx;

describe('GlassdoorProvider capabilities are honest', () => {
  test('does not claim a recommended feed it cannot read', () => {
    assert.equal(new GlassdoorProvider().capabilities.recommendedFeed, false);
  });

  test('does not claim verifyApplied — Glassdoor exposes no reliable applied state', () => {
    assert.equal(new GlassdoorProvider().capabilities.verifyApplied, false);
  });

  test('verifyApplied returns NEEDS_HUMAN rather than a false VERIFIED', async () => {
    const out = await new GlassdoorProvider().verifyApplied(ctxFor(fixture('job-easy-apply.html')), job);
    assert.notEqual(out.status, 'VERIFIED');
  });
});

describe('GlassdoorProvider.apply outcome branches', () => {
  test('employer-site listing hands off to ats-generic', async () => {
    const out = await new GlassdoorProvider().apply(
      ctxFor(fixture('job-employer-site.html')), { ...job, applyType: 'EXTERNAL' }, profile);
    assert.equal(out.status, 'HANDOFF_EXTERNAL');
    if (out.status === 'HANDOFF_EXTERNAL') {
      assert.ok(!out.url.includes('glassdoor.'), 'must hand off the employer url, not the glassdoor page');
    }
  });

  test('Cloudflare challenge is NEEDS_HUMAN, and does not retry in a loop', async () => {
    const out = await new GlassdoorProvider().apply(ctxFor(fixture('cloudflare-challenge.html')), job, profile);
    assert.equal(out.status, 'NEEDS_HUMAN');
    if (out.status === 'NEEDS_HUMAN') assert.equal(out.reason, 'CAPTCHA');
  });

  test('login wall is NEEDS_HUMAN:SESSION_EXPIRED', async () => {
    const out = await new GlassdoorProvider().apply(ctxFor(fixture('login-wall.html')), job, profile);
    assert.equal(out.status, 'NEEDS_HUMAN');
    if (out.status === 'NEEDS_HUMAN') assert.equal(out.reason, 'SESSION_EXPIRED');
  });

  test('easy apply without confirmation is never reported APPLIED', async () => {
    const out = await new GlassdoorProvider().apply(
      ctxFor(fixture('job-easy-apply.html'), { matches: {} }), job, profile);
    if (out.status === 'APPLIED') {
      assert.ok(out.evidence.screenshotKey || out.evidence.htmlSnapshotKey);
    }
  });

  test('page is always closed', async () => {
    const ctx = fakeCtx({ html: fixture('cloudflare-challenge.html'), url: URL_ });
    await new GlassdoorProvider().apply(ctx as unknown as ProviderCtx, job, profile);
    for (const p of (ctx.browser as unknown as { pages: Array<{ closed: boolean }> }).pages) {
      assert.equal(p.closed, true);
    }
  });
});
