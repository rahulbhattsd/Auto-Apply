import { ApplicationAdapter, SubmissionResult, ApplicationOutcome } from '@autoapply/shared';
import type { Page } from 'playwright';
import type { CandidateProfileForApplication } from './GreenhouseAdapter.js';

export interface FormFieldInfo {
  tagName: string;
  type?: string | undefined;
  name?: string | undefined;
  id?: string | undefined;
  placeholder?: string | undefined;
  ariaLabel?: string | undefined;
  required?: boolean | undefined;
  associatedLabelText?: string | undefined;
  options?: string[] | undefined;
}

export class GenericFallbackAdapter implements ApplicationAdapter {
  canHandle(): boolean {
    return true; // Fallback handles everything else
  }

  async inspect(page: unknown, url: string): Promise<Record<string, unknown>> {
    const browserPage = page as Page;
    await browserPage.goto(url, { waitUntil: 'networkidle' });

    const captchaFrames = await browserPage.$$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captchaFrames.length > 0) {
      throw new Error('CAPTCHA_DETECTED');
    }

    const mfaElements = await browserPage.$$('input[name*="code"], input[name*="mfa"]');
    if (mfaElements.length > 0) {
      throw new Error('MFA_DETECTED');
    }

    const inputs = await browserPage.$$eval('form input:not([type="hidden"]), form select, form textarea', (els) =>
      els.map((el) => {
        const field = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const result: FormFieldInfo = {
          tagName: field.tagName.toLowerCase(),
          ...(field.getAttribute('type') ? { type: field.getAttribute('type')! } : {}),
          ...(field.getAttribute('name') ? { name: field.getAttribute('name')! } : {}),
          ...(field.getAttribute('id') ? { id: field.getAttribute('id')! } : {}),
          ...(field.getAttribute('placeholder') ? { placeholder: field.getAttribute('placeholder')! } : {}),
          ...(field.getAttribute('aria-label') ? { ariaLabel: field.getAttribute('aria-label')! } : {}),
          required: field.required || field.getAttribute('aria-required') === 'true',
        };

        if (field.id) {
          const label = document.querySelector(`label[for="${field.id}"]`);
          if (label && label.textContent?.trim()) {
            result.associatedLabelText = label.textContent.trim();
          }
        }
        if (!result.associatedLabelText) {
          const parentLabel = el.closest('label');
          if (parentLabel && parentLabel.textContent?.trim()) {
            result.associatedLabelText = parentLabel.textContent.trim();
          }
        }

        if (field.tagName.toLowerCase() === 'select') {
          result.options = Array.from((field as HTMLSelectElement).options).map((o) => o.value);
        }

        return result;
      })
    );

    return { inputs };
  }

  async fill(page: unknown, profile: unknown, resumePath: string): Promise<ApplicationOutcome> {
    const browserPage = page as Page;
    const url = browserPage.url();

    // Idempotency: Prevent duplicate filling if already on success page
    if (url.includes('confirmation') || url.includes('success')) {
      return { type: 'SUBMITTED', evidence: { confirmationUrl: url } };
    }

    // Check CAPTCHA
    const captcha = await browserPage.$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captcha) {
      return { type: 'HUMAN_VERIFICATION_REQUIRED', reason: 'CAPTCHA detected' };
    }

    const candidate = profile as CandidateProfileForApplication;

    // Fill common input fields
    const nameInput = await browserPage.$('input[name*="name" i], input[id*="name" i], input[placeholder*="name" i]');
    if (nameInput && candidate.name) {
      await nameInput.fill(candidate.name).catch(() => {});
    }

    const email = candidate.user?.email || candidate.email || '';
    const emailInput = await browserPage.$('input[name*="email" i], input[type="email"], input[id*="email" i]');
    if (emailInput && email) {
      await emailInput.fill(email).catch(() => {});
    }

    const phoneInput = await browserPage.$('input[name*="phone" i], input[type="tel"], input[id*="phone" i]');
    if (phoneInput && candidate.phone) {
      await phoneInput.fill(candidate.phone).catch(() => {});
    }

    const linkedinInput = await browserPage.$('input[name*="linkedin" i], input[id*="linkedin" i]');
    if (linkedinInput && candidate.linkedin) {
      await linkedinInput.fill(candidate.linkedin).catch(() => {});
    }

    const fileInput = await browserPage.$('input[type="file"]');
    if (fileInput && resumePath) {
      await fileInput.setInputFiles(resumePath).catch(() => {});
    }

    // Check for missing required fields
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

    const submitSelector = 'button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")';
    const submitBtn = await browserPage.$(submitSelector);
    if (!submitBtn) {
      return { type: 'FAILED', reason: 'NO_SUBMIT_BUTTON' };
    }

    return { type: 'READY_TO_SUBMIT', submitLocator: submitSelector };
  }

  async submit(page: unknown, submitLocator?: string): Promise<SubmissionResult> {
    const browserPage = page as Page;

    const initialUrl = browserPage.url();
    if (initialUrl.includes('confirmation') || initialUrl.includes('success')) {
      return { confirmed: true, evidence: { confirmationUrl: initialUrl } };
    }

    if (!submitLocator) {
      submitLocator = 'button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")';
    }

    await browserPage.click(submitLocator, { timeout: 5000 });

    try {
      const confirmation = await browserPage.waitForSelector('text=/thank you|success|application submitted/i', {
        timeout: 10000,
      });
      const textContent = await confirmation.textContent();
      return {
        confirmed: true,
        evidence: {
          confirmationUrl: browserPage.url(),
          ...(textContent ? { confirmationText: textContent } : {}),
        },
      };
    } catch {
      const url = browserPage.url();
      if (url.includes('confirmation') || url.includes('success')) {
        return { confirmed: true, evidence: { confirmationUrl: url } };
      }
      return { confirmed: false };
    }
  }
}
