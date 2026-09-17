import { test, describe } from 'node:test';
import strictAssert from 'node:assert';
import { AtsGenericProvider, atsGenericProvider } from '../src/index.js';
import { ProviderRegistry, type ProviderCtx, type CanonicalJob, type ApplyProfile } from '@autoapply/providers-core';
import type { BrowserContext, Page } from 'playwright';

describe('AtsGenericProvider', () => {
  test('provider is registered in ProviderRegistry', () => {
    strictAssert.strictEqual(ProviderRegistry.has('ats-generic'), true);
    strictAssert.strictEqual(ProviderRegistry.get('ats-generic'), atsGenericProvider);
  });

  test('conforms to JobProvider interface with correct capabilities', () => {
    const provider = new AtsGenericProvider();
    strictAssert.strictEqual(provider.id, 'ats-generic');
    strictAssert.deepStrictEqual(provider.capabilities, {
      search: false,
      recommendedFeed: false,
      internalApply: false,
      externalHandoff: false,
      verifyApplied: true,
    });
  });

  test('getAdapter resolves correct adapter by URL', () => {
    const provider = new AtsGenericProvider();

    const gh = provider.getAdapter('https://boards.greenhouse.io/acme/jobs/123');
    strictAssert.strictEqual(gh.constructor.name, 'GreenhouseAdapter');

    const lever = provider.getAdapter('https://jobs.lever.co/acme/456');
    strictAssert.strictEqual(lever.constructor.name, 'LeverAdapter');

    const ashby = provider.getAdapter('https://jobs.ashbyhq.com/acme/789');
    strictAssert.strictEqual(ashby.constructor.name, 'AshbyAdapter');

    const workable = provider.getAdapter('https://apply.workable.com/acme/j/ABC');
    strictAssert.strictEqual(workable.constructor.name, 'WorkableAdapter');

    const workday = provider.getAdapter('https://acme.myworkdayjobs.com/en-US/careers');
    strictAssert.strictEqual(workday.constructor.name, 'WorkdayAdapter');

    const darwinbox = provider.getAdapter('https://acme.darwinbox.in/careers');
    strictAssert.strictEqual(darwinbox.constructor.name, 'DarwinboxAdapter');

    const fallback = provider.getAdapter('https://careers.unknownstartup.com/apply');
    strictAssert.strictEqual(fallback.constructor.name, 'GenericFallbackAdapter');
  });

  test('apply handles CAPTCHA blocker returning NEEDS_HUMAN with evidence', async () => {
    const provider = new AtsGenericProvider();

    const mockPage = {
      goto: async () => {},
      url: () => 'https://boards.greenhouse.io/acme/jobs/123',
      $$: async (sel: string) => (sel.includes('recaptcha') ? ['iframe'] : []),
      $$eval: async () => [],
      screenshot: async () => Buffer.from('mock-png'),
      content: async () => '<html><body>mock</body></html>',
      close: async () => {},
    } as unknown as Page;

    const mockBrowser = {
      newPage: async () => mockPage,
    } as unknown as BrowserContext;

    const ctx: ProviderCtx = {
      userId: 'user-1',
      browser: mockBrowser,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      budget: {
        userId: 'user-1',
        provider: 'ats-generic',
        windowDate: '2026-09-17',
        appliesUsed: 0,
        searchesUsed: 0,
      },
      abortSignal: new AbortController().signal,
    };

    const job: CanonicalJob = {
      providerJobId: 'job-1',
      provider: 'ats-generic',
      title: 'Full Stack Engineer',
      company: 'Acme',
      locations: ['Remote'],
      applyType: 'EXTERNAL',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    };

    const profile: ApplyProfile = {
      name: 'John Doe',
      email: 'john@example.com',
    };

    const outcome = await provider.apply(ctx, job, profile);

    strictAssert.strictEqual(outcome.status, 'NEEDS_HUMAN');
    if (outcome.status === 'NEEDS_HUMAN') {
      strictAssert.strictEqual(outcome.reason, 'CAPTCHA');
      strictAssert.ok(outcome.evidence);
      strictAssert.strictEqual(outcome.evidence.url, 'https://boards.greenhouse.io/acme/jobs/123');
    }
  });

  test('verifyApplied detects confirmed application', async () => {
    const provider = new AtsGenericProvider();

    const mockPage = {
      goto: async () => {},
      url: () => 'https://boards.greenhouse.io/acme/jobs/123/confirmation',
      textContent: async () => 'Thank you for your application!',
      screenshot: async () => Buffer.from('mock-png'),
      content: async () => '<html><body>Thank you</body></html>',
      close: async () => {},
    } as unknown as Page;

    const mockBrowser = {
      newPage: async () => mockPage,
    } as unknown as BrowserContext;

    const ctx: ProviderCtx = {
      userId: 'user-1',
      browser: mockBrowser,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      budget: {
        userId: 'user-1',
        provider: 'ats-generic',
        windowDate: '2026-09-17',
        appliesUsed: 0,
        searchesUsed: 0,
      },
      abortSignal: new AbortController().signal,
    };

    const job: CanonicalJob = {
      providerJobId: 'job-1',
      provider: 'ats-generic',
      title: 'Full Stack Engineer',
      company: 'Acme',
      locations: ['Remote'],
      applyType: 'EXTERNAL',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    };

    const verifyOutcome = await provider.verifyApplied(ctx, job);
    strictAssert.strictEqual(verifyOutcome.status, 'VERIFIED');
    if (verifyOutcome.status === 'VERIFIED') {
      strictAssert.ok(verifyOutcome.evidence);
    }
  });
});
