import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyJobPage } from '../src/pageClassifier.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__');
const fixture = (n: string) => readFileSync(join(FIX, n), 'utf8');

describe('glassdoor classifyJobPage', () => {
  test('Easy Apply listing is INTERNAL', () => {
    const c = classifyJobPage(fixture('job-easy-apply.html'));
    assert.equal(c.loggedIn, true);
    assert.equal(c.easyApply, true);
    assert.equal(c.applyType, 'INTERNAL');
  });

  test('employer-site listing is EXTERNAL and exposes the target url', () => {
    const c = classifyJobPage(fixture('job-employer-site.html'));
    assert.equal(c.easyApply, false);
    assert.equal(c.applyType, 'EXTERNAL');
    assert.equal(c.externalUrl, 'https://boards.greenhouse.io/piedpiper/jobs/4242');
  });

  test('external url is routable by the existing ats-generic adapters', () => {
    const c = classifyJobPage(fixture('job-employer-site.html'));
    assert.ok(/greenhouse|lever|ashby|workable|myworkdayjobs|darwinbox/.test(c.externalUrl ?? ''));
  });

  test('already applied is detected', () => {
    assert.equal(classifyJobPage(fixture('job-already-applied.html')).alreadyApplied, true);
  });

  test('Cloudflare interstitial is CAPTCHA, not UNKNOWN_UI', () => {
    const c = classifyJobPage(fixture('cloudflare-challenge.html'));
    assert.equal(c.blocker, 'CAPTCHA');
    assert.notEqual(c.applyType, 'INTERNAL');
  });

  test('login/hardsell wall is SESSION_EXPIRED', () => {
    const c = classifyJobPage(fixture('login-wall.html'));
    assert.equal(c.loggedIn, false);
    assert.equal(c.blocker, 'SESSION_EXPIRED');
  });

  test('unknown markup degrades to UNKNOWN_UI', () => {
    assert.equal(classifyJobPage('<html><body>hi</body></html>').blocker, 'UNKNOWN_UI');
  });
});
