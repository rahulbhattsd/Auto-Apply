import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  sealSession,
  openSession,
  redactForLog,
  checkApplyBudget,
  windowDateFor,
  applyDelayMs,
  type CanonicalJob,
  type ApplyProfile,
  type ProviderCtx,
} from '@autoapply/providers-core';
import { fakeCtx } from '@autoapply/providers-core/testing/fakePage.js';
import { NaukriProvider } from '../src/NaukriProvider.js';
import { parseSearchPayload, parseJobDetail } from '../src/searchParser.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '../__fixtures__');
const fixture = (n: string) => readFileSync(join(FIX, n), 'utf8');

describe('Virtual Website Simulation Test (Offline End-to-End)', () => {
  const MASTER_KEY = randomBytes(32).toString('base64');
  const initialStorageState = {
    cookies: [
      { name: 'nauk_at', value: 'secret-session-auth-token', domain: '.naukri.com' },
      { name: 'user_id', value: 'usr_998877', domain: '.naukri.com' },
    ],
    origins: [],
  };

  test('Stage 1: Encrypt and seal candidate session before application run', () => {
    const sealed = sealSession(initialStorageState, MASTER_KEY, 1);
    assert.ok(sealed.ciphertext.length > 0);
    assert.ok(sealed.iv.length === 12);
    assert.ok(sealed.tag.length === 16);
    assert.equal(sealed.keyVersion, 1);

    // Assert that sensitive token is never present in ciphertext
    const rawCiphertext = sealed.ciphertext.toString('utf8');
    assert.ok(!rawCiphertext.includes('secret-session-auth-token'));

    // Round-trip verification
    const decrypted = openSession<typeof initialStorageState>(sealed, MASTER_KEY);
    assert.deepEqual(decrypted, initialStorageState);

    // Logging redaction test
    const logPayload = redactForLog({
      event: 'SESSION_RESTORED',
      cookies: initialStorageState.cookies,
      token: 'secret-session-auth-token',
      userId: 'usr_998877',
    });
    const serializedLog = JSON.stringify(logPayload);
    assert.ok(!serializedLog.includes('secret-session-auth-token'));
    assert.ok(serializedLog.includes('usr_998877'));
  });

  test('Stage 2: Check rate budget, active IST business hours, and calculate jitter delay', () => {
    // 2 PM IST on 2026-09-17 (08:30 UTC)
    const testNow = new Date('2026-09-17T08:30:00Z');
    const todayWindow = windowDateFor(testNow);
    assert.equal(todayWindow, '2026-09-17');

    const budgetRecord = {
      userId: 'usr_998877',
      provider: 'naukri',
      windowDate: todayWindow,
      appliesUsed: 4,
      searchesUsed: 2,
      maxAppliesPerDay: 20,
    };

    const decision = checkApplyBudget(budgetRecord, testNow);
    assert.equal(decision.allowed, true);

    // Compute realistic randomized delay between applications
    const delay = applyDelayMs();
    assert.ok(delay >= 45_000, `Delay ${delay}ms is less than 45s floor`);
    assert.ok(delay <= 180_000, `Delay ${delay}ms is greater than 180s ceiling`);
  });

  test('Stage 3: Virtual Job Discovery via search results payload', () => {
    const rawPayload = JSON.parse(fixture('search-results.json'));
    const jobRefs = parseSearchPayload(rawPayload);

    assert.equal(jobRefs.length, 2);
    assert.equal(jobRefs[0]?.id, '060925900001');
    assert.equal(jobRefs[0]?.title, 'AI Engineer');
    assert.equal(jobRefs[0]?.company, 'Acme Technologies');
    assert.ok(jobRefs[0]?.url.includes('job-listings-ai-engineer-acme-060925900001'));

    assert.equal(jobRefs[1]?.id, '060925900002');
    assert.equal(jobRefs[1]?.title, 'Backend Engineer');
  });

  test('Stage 4: Virtual Job Detail Parsing & Canonical Normalization', () => {
    const jobHtml = fixture('job-internal-apply.html');
    const jobUrl = 'https://www.naukri.com/job-listings-ai-engineer-acme-060925900001';

    const canonicalJob = parseJobDetail(jobHtml, jobUrl);
    assert.equal(canonicalJob.provider, 'naukri');
    assert.equal(canonicalJob.providerJobId, '060925900001');
    assert.equal(canonicalJob.title, 'AI Engineer');
    assert.equal(canonicalJob.company, 'Acme Technologies');
    assert.deepEqual(canonicalJob.locations, ['Bengaluru', 'Pune']);
    assert.equal(canonicalJob.experienceMin, 0);
    assert.equal(canonicalJob.experienceMax, 2);
    assert.equal(canonicalJob.applyType, 'INTERNAL');
  });

  test('Stage 5: Virtual Apply Execution with Questionnaire and Confirmation Verification', async () => {
    const provider = new NaukriProvider();
    const jobUrl = 'https://www.naukri.com/job-listings-ai-engineer-acme-060925900001';

    const canonicalJob: CanonicalJob = {
      provider: 'naukri',
      providerJobId: '060925900001',
      title: 'AI Engineer',
      company: 'Acme Technologies',
      locations: ['Bengaluru', 'Pune'],
      applyType: 'INTERNAL',
      applyUrl: jobUrl,
    };

    const candidateProfile: ApplyProfile = {
      name: 'Rahul Bhatt',
      email: 'rahul@example.com',
      phone: '+91 9876543210',
      noticePeriod: 'Immediate',
      currentCtc: '0',
      expectedCtc: '12',
      totalExperienceYears: 1,
      answers: {
        notice_period: 'Immediate',
        current_ctc: '0',
        expected_ctc: '12',
        total_experience: '1',
      },
    };

    const simulatedHtml = fixture('job-internal-apply.html');
    const ctx = fakeCtx({
      html: simulatedHtml,
      url: jobUrl,
    }) as unknown as ProviderCtx;

    // Execute application in virtual browser context
    const outcome = await provider.apply(ctx, canonicalJob, candidateProfile);

    // Verify terminal application outcome
    assert.equal(outcome.status, 'APPLIED');
    if (outcome.status === 'APPLIED') {
      assert.ok(outcome.evidence.url);
      assert.ok(outcome.evidence.timestamp);
      assert.ok(outcome.evidence.screenshotKey || outcome.evidence.htmlSnapshotKey);
    }

    // Verify post-apply state
    const verifyCtx = fakeCtx({
      html: fixture('job-already-applied.html'),
      url: jobUrl,
    }) as unknown as ProviderCtx;

    const verifyOutcome = await provider.verifyApplied(verifyCtx, canonicalJob);
    assert.equal(verifyOutcome.status, 'VERIFIED');
  });
});
