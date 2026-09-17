import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSearchPayload, parseJobDetail, parseExperience } from '../src/searchParser.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__');
const fixture = (n: string) => readFileSync(join(FIX, n), 'utf8');

describe('parseSearchPayload', () => {
  const payload = JSON.parse(fixture('search-results.json'));

  test('returns one ref per job with stable ids', () => {
    const refs = parseSearchPayload(payload);
    assert.equal(refs.length, 2);
    assert.equal(refs[0]?.id, '060925900001');
    assert.equal(refs[1]?.id, '060925900002');
  });

  test('builds absolute urls from relative jdURL', () => {
    const refs = parseSearchPayload(payload);
    for (const r of refs) assert.ok(r.url.startsWith('https://www.naukri.com/'));
  });

  test('ids are unique — this is the dedupe key for Job.providerJobId', () => {
    const refs = parseSearchPayload(payload);
    assert.equal(new Set(refs.map((r) => r.id)).size, refs.length);
  });

  test('tolerates a missing jobDetails array', () => {
    assert.deepEqual(parseSearchPayload({}), []);
    assert.deepEqual(parseSearchPayload(null), []);
  });

  test('skips malformed entries rather than throwing the whole batch away', () => {
    const refs = parseSearchPayload({ jobDetails: [{ title: 'no id' }, payload.jobDetails[0]] });
    assert.equal(refs.length, 1);
  });
});

describe('parseExperience', () => {
  const cases: Array<[string, number | null, number | null]> = [
    ['0 - 2 years', 0, 2],
    ['0-2 Yrs', 0, 2],
    ['1 - 3 years', 1, 3],
    ['Fresher', 0, 0],
    ['10+ Yrs', 10, null],
    ['Not disclosed', null, null],
    ['', null, null],
  ];
  for (const [label, min, max] of cases) {
    test(`"${label}" -> ${min}/${max}`, () => {
      assert.deepEqual(parseExperience(label), { min, max });
    });
  }
});

describe('parseJobDetail', () => {
  const url = 'https://www.naukri.com/job-listings-ai-engineer-acme-060925900001';

  test('extracts the canonical fields', () => {
    const job = parseJobDetail(fixture('job-internal-apply.html'), url);
    assert.equal(job.provider, 'naukri');
    assert.equal(job.providerJobId, '060925900001');
    assert.equal(job.title, 'AI Engineer');
    assert.equal(job.company, 'Acme Technologies');
    assert.deepEqual(job.locations, ['Bengaluru', 'Pune']);
    assert.equal(job.experienceMin, 0);
    assert.equal(job.experienceMax, 2);
    assert.equal(job.applyType, 'INTERNAL');
  });

  test('splits multi-location strings instead of storing one blob', () => {
    const job = parseJobDetail(fixture('job-internal-apply.html'), url);
    assert.ok(job.locations.length > 1);
    for (const l of job.locations) assert.ok(!l.includes(','));
  });

  test('never returns an empty title — falls back rather than storing ""', () => {
    const job = parseJobDetail('<html><body></body></html>', url);
    assert.ok(job.title.length > 0);
  });
});
