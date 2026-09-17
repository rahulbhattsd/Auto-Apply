import { ApplicationAdapter, SubmissionResult, ApplicationOutcome } from '@autoapply/shared';
import type { Page } from 'playwright';
import type { CandidateProfileForApplication } from './GreenhouseAdapter.js';

export class AshbyAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('jobs.ashbyhq.com') || url.includes('ashbyhq');
  }

  async inspect(page: unknown, url: string): Promise<Record<string, unknown>> {
    const browserPage = page as Page;
    await browserPage.goto(url, { waitUntil: 'networkidle' });

    const captchaFrames = await browserPage.$$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captchaFrames.length > 0) {
      throw new Error('CAPTCHA_DETECTED');
    }

    const mfaElements = await browserPage.$$('input[name*="code" i], input[name*="mfa" i], input[name*="otp" i], input[id*="otp" i], input[name*="2fa" i], input[autocomplete="one-time-code"]');
    if (mfaElements.length > 0) {
      throw new Error('MFA_DETECTED');
    }

    const inputs = await browserPage.$$eval('input, select, textarea', (els) =>
      els.map((el) => {
        const field = el as unknown as Record<string, string | undefined>;
        return { name: field['name'], type: field['type'] || field['tagName']?.toLowerCase(), id: field['id'] };
      })
    );

    return { inputs };
  }

  async fill(page: unknown, profile: unknown, resumePath: string): Promise<ApplicationOutcome> {
    const browserPage = page as Page;
    const candidate = profile as CandidateProfileForApplication;

    // Check CAPTCHA
    const captcha = await browserPage.$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captcha) {
      return { type: 'HUMAN_VERIFICATION_REQUIRED', reason: 'CAPTCHA detected on Ashby application' };
    }

    // Name field
    const nameInput = await browserPage.$('input[name="name"], input[name*="fullName"], input[placeholder*="Name" i]');
    if (nameInput) {
      await nameInput.fill(candidate.name || '');
    }

    // Email field
    const email = candidate.user?.email || candidate.email || '';
    const emailInput = await browserPage.$('input[name="email"], input[type="email"]');
    if (emailInput) {
      await emailInput.fill(email);
    }

    // Phone field
    if (candidate.phone) {
      const phoneInput = await browserPage.$('input[name="phone"], input[type="tel"]');
      if (phoneInput) {
        await phoneInput.fill(candidate.phone);
      }
    }

    // LinkedIn
    if (candidate.linkedin) {
      const linkedinInput = await browserPage.$('input[name*="linkedin" i], input[placeholder*="linkedin" i]');
      if (linkedinInput) {
        await linkedinInput.fill(candidate.linkedin);
      }
    }

    // Resume file upload
    const fileInput = await browserPage.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(resumePath);
    }

    // Handle voluntary EEO fields (Decline to answer)
    const selects = await browserPage.$$('select');
    for (const select of selects) {
      const labelText = await browserPage.evaluate((el) => {
        const idAttr = el.getAttribute('id');
        if (!idAttr) return '';
        const label = document.querySelector(`label[for="${idAttr}"]`);
        return label ? label.textContent?.toLowerCase() || '' : '';
      }, select);

      if (
        labelText.includes('gender') ||
        labelText.includes('race') ||
        labelText.includes('veteran') ||
        labelText.includes('disability') ||
        labelText.includes('eeo')
      ) {
        const options = await select.$$('option');
        for (const option of options) {
          const text = (await option.textContent())?.toLowerCase() || '';
          if (text.includes('decline') || text.includes('prefer not') || text.includes('wish not')) {
            const val = await option.getAttribute('value');
            if (val) await select.selectOption(val);
            break;
          }
        }
      }
    }

    // Validate required fields
    const missing = await browserPage.$$eval('input[required], select[required], textarea[required]', (elements) =>
      elements
        .filter((element) => {
          const input = element as unknown as { type: string; value: string };
          return input.type !== 'hidden' && !input.value;
        })
        .map((element) => element.getAttribute('name') || element.id || element.getAttribute('aria-label') || 'unknown')
    );

    if (missing.length > 0) {
      return { type: 'BLOCKED_REQUIRED_FIELD', fields: missing };
    }

    return { type: 'READY_TO_SUBMIT', submitLocator: 'button[type="submit"]' };
  }

  async submit(page: unknown, submitLocator?: string): Promise<SubmissionResult> {
    const browserPage = page as Page;
    const locator = submitLocator || 'button[type="submit"]';

    await browserPage.click(locator);

    try {
      await browserPage.waitForSelector('text=/thank you|application submitted|application received/i', { timeout: 10000 });
      return {
        confirmed: true,
        evidence: {
          confirmationUrl: browserPage.url(),
          confirmationText: 'Application submitted successfully on Ashby',
        },
      };
    } catch {
      const url = browserPage.url();
      if (url.includes('submitted') || url.includes('success') || url.includes('thank')) {
        return { confirmed: true, evidence: { confirmationUrl: url } };
      }
      return { confirmed: false };
    }
  }
}
