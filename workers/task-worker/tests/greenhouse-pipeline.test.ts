import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProviderRegistry, type ProviderCtx, type CanonicalJob, type ApplyProfile } from '@autoapply/providers-core';
import { AtsGenericProvider } from '@autoapply/providers-ats-generic';
import { launchPlaywrightBrowser } from '../src/browser.js';

test('End-to-End Pipeline: ATS Generic Provider applying to Greenhouse Job fixture', async () => {
  // 1. Ensure AtsGenericProvider is wired and registered in ProviderRegistry
  if (!ProviderRegistry.has('ats-generic')) {
    ProviderRegistry.register(new AtsGenericProvider());
  }

  const provider = ProviderRegistry.get('ats-generic');
  assert.strictEqual(provider.id, 'ats-generic');

  // 2. Read the Greenhouse normal fixture HTML
  const fixturePath = path.resolve(
    __dirname,
    '../../../packages/providers/ats-generic/tests/fixtures/greenhouse-normal.html'
  );
  assert.ok(fs.existsSync(fixturePath), `Fixture file not found at ${fixturePath}`);
  const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

  // 3. Start local HTTP server serving the Greenhouse fixture
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fixtureHtml);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number; address: string };
  const targetUrl = `http://127.0.0.1:${address.port}/boards.greenhouse.io/jobs/123`;

  // 4. Create a temporary resume file for file upload
  const tempResumePath = path.join(os.tmpdir(), `test-resume-${Date.now()}.pdf`);
  fs.writeFileSync(tempResumePath, '%PDF-1.4 Mock resume content for testing');

  // 5. Launch Playwright browser and create context
  const browser = await launchPlaywrightBrowser();
  const context = await browser.newContext();

  const ctx: ProviderCtx = {
    userId: 'test-applicant-42',
    browser: context,
    logger: {
      info: (msg, ...args) => console.log(`[E2E Info] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[E2E Warn] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[E2E Error] ${msg}`, ...args),
    },
    budget: {
      userId: 'test-applicant-42',
      provider: 'ats-generic',
      windowDate: '2026-09-17',
      appliesUsed: 0,
      searchesUsed: 0,
    },
    abortSignal: new AbortController().signal,
  };

  const canonicalJob: CanonicalJob = {
    providerJobId: 'gh-mock-12345',
    provider: 'ats-generic',
    title: 'Senior TypeScript Engineer',
    company: 'Acme Systems',
    locations: ['Remote', 'India'],
    applyType: 'EXTERNAL',
    applyUrl: targetUrl,
    sourceUrl: targetUrl,
  };

  const profile: ApplyProfile = {
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+919876543210',
    linkedin: 'https://linkedin.com/in/janedoe',
    resumePath: tempResumePath,
  };

  try {
    // 6. Execute apply end-to-end
    console.log(`Applying to Greenhouse job at ${targetUrl}...`);
    const applyOutcome = await provider.apply(ctx, canonicalJob, profile);

    console.log('Apply Outcome:', applyOutcome.status);
    assert.strictEqual(applyOutcome.status, 'APPLIED');
    assert.ok('evidence' in applyOutcome && applyOutcome.evidence, 'Evidence must be captured on APPLIED outcome');
    assert.ok(applyOutcome.evidence.url.includes('boards.greenhouse.io'));
    assert.ok(applyOutcome.evidence.timestamp);

    // 7. Execute verification
    console.log('Verifying application status...');
    const verifyOutcome = await provider.verifyApplied(ctx, canonicalJob);

    console.log('Verify Outcome:', verifyOutcome.status);
    assert.strictEqual(verifyOutcome.status, 'VERIFIED');
    assert.ok(verifyOutcome.evidence, 'Evidence must be captured on VERIFIED outcome');
  } finally {
    // Cleanup
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    server.close();
    if (fs.existsSync(tempResumePath)) {
      fs.unlinkSync(tempResumePath);
    }
  }
});
