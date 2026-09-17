import { ApplicationAdapter, SubmissionResult, ApplicationOutcome } from '@autoapply/shared';
import type { Page } from 'playwright';
import type { CandidateProfileForApplication } from './GreenhouseAdapter.js';

export class WorkableAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('apply.workable.com') || url.includes('workable.com');
  }

  async inspect(page: unknown, url: string): Promise<Record<string, unknown>> {
    const browserPage = page as Page;
    await browserPage.goto(url, { waitUntil: 'networkidle' });

    const applyButton = await browserPage.$('[data-ui="overview-apply-btn"], a[href*="/apply"]');
    if (applyButton) {
      await applyButton.click();
      await browserPage.waitForTimeout(1000);
    }

    const captchaFrames = await browserPage.$$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captchaFrames.length > 0) {
      throw new Error('CAPTCHA_DETECTED');
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

    // Navigate to apply view if on job description
    const applyButton = await browserPage.$('[data-ui="overview-apply-btn"], a[href*="/apply"]');
    if (applyButton) {
      await applyButton.click();
      await browserPage.waitForTimeout(1000);
    }

    // CAPTCHA check
    const captcha = await browserPage.$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captcha) {
      return { type: 'HUMAN_VERIFICATION_REQUIRED', reason: 'CAPTCHA detected on Workable application' };
    }

    // First and last name or full name
    const fullNameInput = await browserPage.$('input[name="name"], input[data-ui="name"]');
    if (fullNameInput) {
      await fullNameInput.fill(candidate.name || '');
    } else {
      const parts = (candidate.name || '').split(' ');
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || firstName;
      const fNameInput = await browserPage.$('input[name="firstname"], input[name="firstName"]');
      if (fNameInput) await fNameInput.fill(firstName);
      const lNameInput = await browserPage.$('input[name="lastname"], input[name="lastName"]');
      if (lNameInput) await lNameInput.fill(lastName);
    }

    // Email
    const email = candidate.user?.email || candidate.email || '';
    const emailInput = await browserPage.$('input[name="email"], input[type="email"]');
    if (emailInput) {
      await emailInput.fill(email);
    }

    // Phone
    if (candidate.phone) {
      const phoneInput = await browserPage.$('input[name="phone"], input[type="tel"]');
      if (phoneInput) await phoneInput.fill(candidate.phone);
    }

    // Resume
    const fileInput = await browserPage.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(resumePath);
    }

    // Validate required fields
    const missing = await browserPage.$$eval('input[required], select[required], textarea[required]', (elements) =>
      elements
        .filter((element) => {
          const input = element as unknown as { type: string; value: string };
          return input.type !== 'hidden' && !input.value;
        })
        .map((element) => element.getAttribute('name') || element.id || 'unknown')
    );

    if (missing.length > 0) {
      return { type: 'BLOCKED_REQUIRED_FIELD', fields: missing };
    }

    return { type: 'READY_TO_SUBMIT', submitLocator: 'button[data-ui="application-form-submit"], button[type="submit"]' };
  }

  async submit(page: unknown, submitLocator?: string): Promise<SubmissionResult> {
    const browserPage = page as Page;
    const locator = submitLocator || 'button[data-ui="application-form-submit"], button[type="submit"]';

    await browserPage.click(locator);

    try {
      await browserPage.waitForSelector('text=/thank you|application submitted|successfully applied/i', { timeout: 10000 });
      return {
        confirmed: true,
        evidence: {
          confirmationUrl: browserPage.url(),
          confirmationText: 'Application submitted successfully on Workable',
        },
      };
    } catch {
      const url = browserPage.url();
      if (url.includes('thank') || url.includes('success')) {
        return { confirmed: true, evidence: { confirmationUrl: url } };
      }
      return { confirmed: false };
    }
  }
}
