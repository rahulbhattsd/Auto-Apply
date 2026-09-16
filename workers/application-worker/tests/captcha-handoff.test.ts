import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { classifyError, ErrorCategory } from '../src/errors';
import { FormCompletionEngine } from '@autoapply/ai-analysis';
import { AshbyAdapter } from '../src/adapters/AshbyAdapter';
import { GreenhouseAdapter } from '../src/adapters/GreenhouseAdapter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Error Classification - CAPTCHA and OTP / MFA Detection', async (t) => {
  await t.test('reCAPTCHA error is classified as HUMAN_VERIFICATION_REQUIRED', () => {
    const error = new Error('recaptcha challenge presented');
    const classification = classifyError(error);
    assert.strictEqual(classification.category, ErrorCategory.HUMAN_VERIFICATION_REQUIRED);
    assert.strictEqual(classification.needsHuman, true);
    assert.strictEqual(classification.retryable, false);
    assert.strictEqual(classification.resumable, true);
  });

  await t.test('Cloudflare turnstile error is classified as HUMAN_VERIFICATION_REQUIRED', () => {
    const error = new Error('cloudflare turnstile verification required');
    const classification = classifyError(error);
    assert.strictEqual(classification.category, ErrorCategory.HUMAN_VERIFICATION_REQUIRED);
    assert.strictEqual(classification.needsHuman, true);
  });

  await t.test('MFA challenge error is classified as HUMAN_VERIFICATION_REQUIRED', () => {
    const error = new Error('MFA_DETECTED: user must provide authenticator code');
    const classification = classifyError(error);
    assert.strictEqual(classification.category, ErrorCategory.HUMAN_VERIFICATION_REQUIRED);
    assert.strictEqual(classification.needsHuman, true);
  });

  await t.test('OTP (One-Time Password) error is classified as HUMAN_VERIFICATION_REQUIRED', () => {
    const error = new Error('OTP_DETECTED: please enter the 6-digit sms otp code');
    const classification = classifyError(error);
    assert.strictEqual(classification.category, ErrorCategory.HUMAN_VERIFICATION_REQUIRED);
    assert.strictEqual(classification.needsHuman, true);
    assert.strictEqual(classification.terminal, false);
  });

  await t.test('2FA verification error is classified as HUMAN_VERIFICATION_REQUIRED', () => {
    const error = new Error('2fa required before proceeding to application');
    const classification = classifyError(error);
    assert.strictEqual(classification.category, ErrorCategory.HUMAN_VERIFICATION_REQUIRED);
    assert.strictEqual(classification.needsHuman, true);
  });
});

test('FormCompletionEngine - Browser Detection of CAPTCHA and OTP / MFA', async (t) => {
  const browser = await chromium.launch({ headless: true });
  const engine = new FormCompletionEngine();

  await t.test('Detects CAPTCHA in page content and halts for human verification', async () => {
    const page = await browser.newPage();
    const captchaFixture = `file://${path.resolve(__dirname, 'fixtures/generic-captcha.html')}`;
    await page.goto(captchaFixture);

    const outcome = await engine.processPage(page, { name: 'Test Candidate' });
    assert.strictEqual(outcome.type, 'HUMAN_VERIFICATION_REQUIRED');
    if (outcome.type === 'HUMAN_VERIFICATION_REQUIRED') {
      assert.strictEqual(outcome.reason, 'CAPTCHA_DETECTED');
    }
    await page.close();
  });

  await t.test('Detects MFA input field in page content and halts for human verification', async () => {
    const page = await browser.newPage();
    const mfaFixture = `file://${path.resolve(__dirname, 'fixtures/generic-mfa.html')}`;
    await page.goto(mfaFixture);

    const outcome = await engine.processPage(page, { name: 'Test Candidate' });
    assert.strictEqual(outcome.type, 'HUMAN_VERIFICATION_REQUIRED');
    if (outcome.type === 'HUMAN_VERIFICATION_REQUIRED') {
      assert.strictEqual(outcome.reason, 'MFA_DETECTED');
    }
    await page.close();
  });

  await t.test('Detects OTP one-time-code field in page content and halts for human verification', async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <h2>Security Verification</h2>
          <form>
            <label for="otp">Enter SMS Code</label>
            <input type="text" id="otp" name="otp_code" autocomplete="one-time-code" required />
            <button type="submit">Verify</button>
          </form>
        </body>
      </html>
    `);

    const outcome = await engine.processPage(page, { name: 'Test Candidate' });
    assert.strictEqual(outcome.type, 'HUMAN_VERIFICATION_REQUIRED');
    if (outcome.type === 'HUMAN_VERIFICATION_REQUIRED') {
      assert.strictEqual(outcome.reason, 'MFA_DETECTED');
    }
    await page.close();
  });

  await browser.close();
});

test('Adapter Inspection - Dedicated ATS Adapters catch CAPTCHA and MFA', async (t) => {
  const browser = await chromium.launch({ headless: true });

  await t.test('AshbyAdapter inspect detects CAPTCHA iframe', async () => {
    const adapter = new AshbyAdapter();
    const page = await browser.newPage();
    const testUrl = 'data:text/html,<html><body><iframe src="https://recaptcha.net/api/frame"></iframe></body></html>';

    await assert.rejects(async () => {
      await adapter.inspect(page, testUrl);
    }, /CAPTCHA_DETECTED/);

    await page.close();
  });

  await t.test('AshbyAdapter inspect detects OTP / MFA input', async () => {
    const adapter = new AshbyAdapter();
    const page = await browser.newPage();
    const testUrl = 'data:text/html,<html><body><input name="otp_code" type="text" /></body></html>';

    await assert.rejects(async () => {
      await adapter.inspect(page, testUrl);
    }, /MFA_DETECTED/);

    await page.close();
  });

  await t.test('GreenhouseAdapter inspect detects OTP / MFA input', async () => {
    const adapter = new GreenhouseAdapter();
    const page = await browser.newPage();
    const testUrl = 'data:text/html,<html><body><input name="mfa_token" type="text" /></body></html>';

    await assert.rejects(async () => {
      await adapter.inspect(page, testUrl);
    }, /MFA_DETECTED/);

    await page.close();
  });

  await browser.close();
});
