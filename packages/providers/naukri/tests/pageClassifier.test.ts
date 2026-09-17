import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyJobPage } from '../src/pageClassifier.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../__fixtures__');
const fixture = (n: string) => readFileSync(join(FIX, n), 'utf8');

describe('naukri classifyJobPage', () => {
  test('internal apply job', () => {
    const c = classifyJobPage(fixture('job-internal-apply.html'));
    assert.equal(c.loggedIn, true);
    assert.equal(c.applyType, 'INTERNAL');
    assert.equal(c.alreadyApplied, false);
    assert.equal(c.blocker, undefined);
  });

  test('external "apply on company site" job hands off', () => {
    const c = classifyJobPage(fixture('job-external-apply.html'));
    assert.equal(c.applyType, 'EXTERNAL');
  });

  test('already-applied job is detected before any click', () => {
    const c = classifyJobPage(fixture('job-already-applied.html'));
    assert.equal(c.alreadyApplied, true);
  });

  test('walk-in listing is SKIPPED, not attempted', () => {
    const c = classifyJobPage(fixture('job-walkin.html'));
    assert.equal(c.applyType, 'SKIPPED');
  });

  test('logged-out page reports SESSION_EXPIRED', () => {
    const c = classifyJobPage(fixture('logged-out.html'));
    assert.equal(c.loggedIn, false);
    assert.equal(c.blocker, 'SESSION_EXPIRED');
  });

  test('captcha page reports CAPTCHA and never an apply type', () => {
    const c = classifyJobPage(fixture('captcha.html'));
    assert.equal(c.blocker, 'CAPTCHA');
    assert.notEqual(c.applyType, 'INTERNAL');
  });

  test('unrecognised markup degrades to UNKNOWN_UI, never a guess', () => {
    const c = classifyJobPage('<html><body><div>totally redesigned</div></body></html>');
    assert.equal(c.blocker, 'UNKNOWN_UI');
    assert.notEqual(c.applyType, 'INTERNAL');
  });

  test('empty input does not throw', () => {
    assert.doesNotThrow(() => classifyJobPage(''));
  });

  test('a page with BOTH buttons prefers the internal path', () => {
    const html = `<html><body><div class="nI-gNb-drawer__bars"></div>
      <button id="apply-button">Apply</button>
      <button id="company-site-button">Apply on company site</button></body></html>`;
    assert.equal(classifyJobPage(html).applyType, 'INTERNAL');
  });
});
