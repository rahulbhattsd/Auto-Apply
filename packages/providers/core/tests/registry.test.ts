import { test, describe, beforeEach } from 'node:test';
import strictAssert from 'node:assert';
import { ProviderRegistry } from '../src/registry.js';
import type { JobProvider, ProviderCtx, SearchQuery, RawJobRef, CanonicalJob, ApplyProfile, ApplyOutcome, VerifyOutcome } from '../src/types.js';

describe('ProviderRegistry', () => {
  beforeEach(() => {
    ProviderRegistry.clear();
  });

  const createMockProvider = (id: 'naukri' | 'linkedin' | 'ats-generic'): JobProvider => ({
    id,
    capabilities: {
      search: true,
      recommendedFeed: false,
      internalApply: true,
      externalHandoff: false,
      verifyApplied: true,
    },
    async search(_ctx: ProviderCtx, _q: SearchQuery): Promise<RawJobRef[]> {
      return [];
    },
    async fetchDetail(_ctx: ProviderCtx, ref: RawJobRef): Promise<CanonicalJob> {
      return {
        providerJobId: ref.id,
        provider: id,
        title: 'Software Engineer',
        company: 'Acme',
        locations: ['Bangalore'],
        applyType: 'INTERNAL',
        applyUrl: ref.url,
      };
    },
    async apply(_ctx: ProviderCtx, job: CanonicalJob, _profile: ApplyProfile): Promise<ApplyOutcome> {
      return {
        status: 'APPLIED',
        evidence: {
          url: job.applyUrl,
          timestamp: new Date().toISOString(),
        },
      };
    },
    async verifyApplied(_ctx: ProviderCtx, _job: CanonicalJob): Promise<VerifyOutcome> {
      return { status: 'VERIFIED' };
    },
  });

  test('registers and retrieves a provider', () => {
    const mock = createMockProvider('ats-generic');
    ProviderRegistry.register(mock);

    strictAssert.strictEqual(ProviderRegistry.has('ats-generic'), true);
    strictAssert.strictEqual(ProviderRegistry.get('ats-generic'), mock);
  });

  test('throws when retrieving an unregistered provider', () => {
    strictAssert.strictEqual(ProviderRegistry.has('naukri'), false);
    strictAssert.throws(
      () => ProviderRegistry.get('naukri'),
      /Provider "naukri" is not registered/
    );
  });

  test('returns all registered providers', () => {
    const ats = createMockProvider('ats-generic');
    const naukri = createMockProvider('naukri');

    ProviderRegistry.register(ats);
    ProviderRegistry.register(naukri);

    const all = ProviderRegistry.getAll();
    strictAssert.strictEqual(all.length, 2);
    strictAssert.ok(all.includes(ats));
    strictAssert.ok(all.includes(naukri));
  });

  test('unregisters a provider', () => {
    const mock = createMockProvider('ats-generic');
    ProviderRegistry.register(mock);
    strictAssert.strictEqual(ProviderRegistry.has('ats-generic'), true);

    const removed = ProviderRegistry.unregister('ats-generic');
    strictAssert.strictEqual(removed, true);
    strictAssert.strictEqual(ProviderRegistry.has('ats-generic'), false);
  });

  test('clears all registered providers', () => {
    ProviderRegistry.register(createMockProvider('ats-generic'));
    ProviderRegistry.register(createMockProvider('naukri'));
    strictAssert.strictEqual(ProviderRegistry.getAll().length, 2);

    ProviderRegistry.clear();
    strictAssert.strictEqual(ProviderRegistry.getAll().length, 0);
  });
});
