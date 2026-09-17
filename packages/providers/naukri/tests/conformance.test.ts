import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NaukriProvider } from '../src/NaukriProvider.js';
import { runProviderConformance } from '@autoapply/providers-core/testing/conformance.js';
import { fakeCtx } from '@autoapply/providers-core/testing/fakePage.js';
import type { ProviderCtx } from '@autoapply/providers-core';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__');
const html = readFileSync(join(FIX, 'job-internal-apply.html'), 'utf8');
const url = 'https://www.naukri.com/job-listings-ai-engineer-acme-060925900001';

runProviderConformance({
  provider: new NaukriProvider(),
  makeCtx: () => fakeCtx({ html, url }) as unknown as ProviderCtx,
  sampleJob: {
    providerJobId: '060925900001',
    provider: 'naukri',
    title: 'AI Engineer',
    company: 'Acme Technologies',
    locations: ['Bengaluru'],
    applyType: 'INTERNAL',
    applyUrl: url,
  },
  sampleProfile: { name: 'Test', email: 'test@example.com' },
});
