import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JobProvider, ProviderCtx, CanonicalJob, ApplyProfile } from '../types.js';

const APPLY_STATUSES = ['APPLIED', 'ALREADY_APPLIED', 'HANDOFF_EXTERNAL', 'NEEDS_HUMAN', 'FAILED'];
const VERIFY_STATUSES = ['VERIFIED', 'NOT_APPLIED', 'NEEDS_HUMAN', 'FAILED'];
const NEEDS_HUMAN_REASONS = [
  'CAPTCHA', 'OTP_REQUIRED', 'SESSION_EXPIRED',
  'UNANSWERABLE_QUESTION', 'UNKNOWN_UI', 'CONFIRMATION_NOT_FOUND',
];

/**
 * Every JobProvider must pass this. Call it from the provider's own test file:
 *
 *   runProviderConformance({ provider: new NaukriProvider(), makeCtx, sampleJob, sampleProfile });
 *
 * The point is that the orchestrator can treat naukri, glassdoor and ats-generic
 * identically. A provider that throws instead of returning FAILED breaks the worker.
 */
export function runProviderConformance(cfg: {
  provider: JobProvider;
  makeCtx: () => ProviderCtx;
  sampleJob: CanonicalJob;
  sampleProfile: ApplyProfile;
}) {
  const { provider, makeCtx, sampleJob, sampleProfile } = cfg;
  const name = provider.id;

  test(`[conformance:${name}] declares a stable id`, () => {
    assert.equal(typeof provider.id, 'string');
    assert.ok(provider.id.length > 0);
  });

  test(`[conformance:${name}] declares all five capability flags as booleans`, () => {
    for (const k of ['search', 'recommendedFeed', 'internalApply', 'externalHandoff', 'verifyApplied']) {
      assert.equal(typeof (provider.capabilities as unknown as Record<string, unknown>)[k], 'boolean', `missing capability: ${k}`);
    }
  });

  test(`[conformance:${name}] search() returns an array, never throws`, async () => {
    const out = await provider.search(makeCtx(), { query: 'ai engineer', limit: 5 });
    assert.ok(Array.isArray(out));
    for (const ref of out) {
      assert.equal(typeof ref.id, 'string');
      assert.equal(typeof ref.url, 'string');
    }
  });

  test(`[conformance:${name}] search() honours capabilities.search`, async () => {
    const out = await provider.search(makeCtx(), { query: 'x' });
    if (!provider.capabilities.search) {
      assert.deepEqual(out, [], 'provider without search capability must return []');
    }
  });

  test(`[conformance:${name}] fetchDetail() returns a CanonicalJob with required fields`, async () => {
    const job = await provider.fetchDetail(makeCtx(), { id: 'j1', url: sampleJob.applyUrl });
    assert.equal(job.provider, provider.id);
    assert.equal(typeof job.providerJobId, 'string');
    assert.equal(typeof job.title, 'string');
    assert.equal(typeof job.company, 'string');
    assert.ok(Array.isArray(job.locations));
    assert.ok(['INTERNAL', 'EXTERNAL', 'SKIPPED'].includes(job.applyType));
  });

  test(`[conformance:${name}] apply() resolves to a known status, never rejects`, async () => {
    const outcome = await provider.apply(makeCtx(), sampleJob, sampleProfile);
    assert.ok(APPLY_STATUSES.includes(outcome.status), `unknown status: ${outcome.status}`);
    if (outcome.status === 'NEEDS_HUMAN') {
      assert.ok(NEEDS_HUMAN_REASONS.includes(outcome.reason));
      assert.ok(outcome.evidence, 'NEEDS_HUMAN must carry evidence');
      assert.equal(typeof outcome.evidence.url, 'string');
      assert.equal(typeof outcome.evidence.timestamp, 'string');
    }
    if (outcome.status === 'APPLIED') {
      assert.ok(outcome.evidence, 'APPLIED must carry evidence — no silent success');
    }
    if (outcome.status === 'FAILED') {
      assert.equal(typeof outcome.retryable, 'boolean');
    }
  });

  test(`[conformance:${name}] apply() never returns APPLIED without confirmation evidence`, async () => {
    const outcome = await provider.apply(makeCtx(), sampleJob, sampleProfile);
    if (outcome.status === 'APPLIED') {
      assert.ok(
        outcome.evidence.screenshotKey || outcome.evidence.htmlSnapshotKey,
        'APPLIED requires a screenshot or html snapshot as proof',
      );
    }
  });

  test(`[conformance:${name}] verifyApplied() resolves to a known status`, async () => {
    const out = await provider.verifyApplied(makeCtx(), sampleJob);
    assert.ok(VERIFY_STATUSES.includes(out.status));
  });

  test(`[conformance:${name}] respects an already-aborted signal`, async () => {
    const ac = new AbortController();
    ac.abort();
    const ctx = { ...makeCtx(), abortSignal: ac.signal };
    const outcome = await provider.apply(ctx, sampleJob, sampleProfile);
    assert.ok(
      outcome.status === 'FAILED' || outcome.status === 'NEEDS_HUMAN',
      'aborted apply must not report success',
    );
  });
}
