import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard test. Runs over BOTH provider packages.
 * A single live call to naukri.com or glassdoor.com from CI is how accounts get flagged.
 */
const PROVIDERS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e === '__fixtures__') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('test suite is offline', () => {
  const files = walk(PROVIDERS_DIR);

  test('finds test files to check', () => {
    assert.ok(files.length > 0);
  });

  for (const f of files) {
    const relName = f.replace(/\\/g, '/').split('/providers/')[1] ?? f;
    test(`${relName} makes no live request`, () => {
      const body = readFileSync(f, 'utf8');
      const banned = [
        /https?:\/\/(www\.)?naukri\.com(?!["'`\s]*$)/,
        /chromium\.launch/,
        /playwright\.chromium/,
        /\bfetch\s*\(\s*['"`]https?:/,
        /axios\.(get|post)\s*\(\s*['"`]https?:/,
      ];
      for (const re of banned) {
        // URLs used only as string literals in fixtures/job objects are fine;
        // what must never appear is a real launch or request.
        if (/chromium\.launch|playwright\.chromium|fetch\s*\(\s*['"`]https?:|axios\.(get|post)\s*\(\s*['"`]https?:/.test(body)) {
          assert.fail(`${f} performs a live call (${re})`);
        }
      }
    });
  }
});
