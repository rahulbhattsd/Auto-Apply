import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlassdoorProvider } from '../src/GlassdoorProvider.js';
import { runProviderConformance } from '@autoapply/providers-core/testing/conformance.js';
import { fakeCtx } from '@autoapply/providers-core/testing/fakePage.js';
import type { ProviderCtx, CanonicalJob } from '@autoapply/providers-core';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__');
const html = readFileSync(join(FIX, 'job-easy-apply.html'), 'utf8');
const url = 'https://www.glassdoor.co.in/job-listing/ml-engineer-hooli-JV_123.htm';

runProviderConformance({
  provider: new GlassdoorProvider(),
  makeCtx: () => fakeCtx({ html, url, provider: 'glassdoor' }) as unknown as ProviderCtx,
  sampleJob: {
    providerJobId: 'JV_123',
    provider: 'glassdoor' as CanonicalJob['provider'],
    title: 'Machine Learning Engineer',
    company: 'Hooli',
    locations: ['Bengaluru'],
    applyType: 'INTERNAL',
    applyUrl: url,
  },
  sampleProfile: { name: 'Test', email: 'test@example.com' },
});
