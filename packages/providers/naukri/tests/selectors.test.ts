import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '../__fixtures__');
const selectors = JSON.parse(readFileSync(join(HERE, '../src/selectors.json'), 'utf8'));

/** ".a.b" / "#id" / "[data-test='x']" -> the literal tokens we can grep for in HTML. */
function tokensOf(selector: string): string[] {
  return selector
    .split(',')
    .map((s) => s.trim())
    .flatMap((s) => s.match(/[.#][A-Za-z0-9_-]+|\[[^\]]+\]/g) ?? [])
    .map((t) => t.replace(/^[.#]/, '').replace(/^\[|\]$/g, ''));
}

describe('selectors.json contract', () => {
  test('declares a schemaVersion', () => {
    assert.equal(typeof selectors.schemaVersion, 'number');
  });

  test('every required group is present', () => {
    for (const g of ['job', 'apply', 'questionnaire', 'search', 'blockers']) {
      assert.ok(selectors[g], `missing selector group: ${g}`);
    }
  });

  test('every leaf is a non-empty string', () => {
    const walk = (o: unknown, path: string[] = []): void => {
      if (typeof o === 'string') {
        assert.ok(o.trim().length > 0, `empty selector at ${path.join('.')}`);
        return;
      }
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          if (['schemaVersion', 'recordedAt', 'note'].includes(k)) continue;
          walk(v, [...path, k]);
        }
      }
    };
    walk(selectors);
  });

  test('no selector is hardcoded anywhere in src/', () => {
    const srcDir = join(HERE, '../src');
    const offenders: string[] = [];
    for (const f of readdirSync(srcDir).filter((f) => f.endsWith('.ts'))) {
      const body = readFileSync(join(srcDir, f), 'utf8');
      if (/["'`][.#][A-Za-z][A-Za-z0-9_-]{3,}["'`]/.test(body)) offenders.push(f);
    }
    assert.deepEqual(offenders, [], `selectors must live in selectors.json, found inline in: ${offenders.join(', ')}`);
  });
});

/**
 * DRIFT CANARY.
 * These run against committed fixtures, so they stay green in CI.
 * Re-record the fixtures (scripts/record-fixtures.ts) after any Naukri redesign;
 * when these go red, the selector config is what needs updating.
 */
describe('selector drift against fixtures', () => {
  const checks: Array<[string, string]> = [
    ['job-internal-apply.html', selectors.job.title],
    ['job-internal-apply.html', selectors.job.company],
    ['job-internal-apply.html', selectors.job.location],
    ['job-internal-apply.html', selectors.job.description],
    ['job-internal-apply.html', selectors.apply.internalButton],
    ['job-external-apply.html', selectors.apply.externalButton],
    ['job-already-applied.html', selectors.apply.alreadyApplied],
    ['questionnaire-modal.html', selectors.questionnaire.container],
    ['questionnaire-modal.html', selectors.questionnaire.questionText],
    ['questionnaire-modal.html', selectors.questionnaire.saveButton],
    ['logged-out.html', selectors.loginRedirect],
    ['captcha.html', selectors.blockers.captcha],
  ];

  for (const [file, selector] of checks) {
    test(`${selector} still resolves in ${file}`, () => {
      const html = readFileSync(join(FIX, file), 'utf8');
      for (const token of tokensOf(selector)) {
        assert.ok(html.includes(token.split('*=')[0]?.split('=')[0] ?? token),
          `token "${token}" not found in ${file} — selector drift`);
      }
    });
  }
});
