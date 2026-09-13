import { ApplicationAdapter, SubmissionResult } from '@autoapply/shared';
import type { Page } from 'playwright';
import { FormField, FormCompletionEngine } from '@autoapply/ai-analysis';

type CandidateProfileForApplication = {
  name?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  user?: {
    email?: string | null;
  } | null;
  [key: string]: unknown;
};

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
        const result: FormField = {
          tagName: field.tagName.toLowerCase(),
          ...(field.getAttribute('type') ? { type: field.getAttribute('type')! } : {}),
          ...(field.getAttribute('name') ? { name: field.getAttribute('name')! } : {}),
          ...(field.getAttribute('id') ? { id: field.getAttribute('id')! } : {}),
          ...(field.getAttribute('placeholder') ? { placeholder: field.getAttribute('placeholder')! } : {}),
          ...(field.getAttribute('aria-label') ? { ariaLabel: field.getAttribute('aria-label')! } : {}),
          required: field.required || field.getAttribute('aria-required') === 'true',
        };

        // Try to find associated label
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
          result.options = Array.from((field as HTMLSelectElement).options).map(o => o.value);
        }

        return result;
      })
    );

    return { inputs };
  }

  async fill(page: unknown, profile: unknown, resumePath: string): Promise<void> {
    const browserPage = page as Page;
    const url = browserPage.url();

    // Idempotency: Prevent duplicate filling if already on success page
    if (url.includes('confirmation') || url.includes('success')) {
        return;
    }

    const candidate = profile as CandidateProfileForApplication;

    // Use the new FormCompletionEngine from Phase 3 intelligence layer
    const engine = new FormCompletionEngine();

    // Final check to preserve legacy safety guards BEFORE we process and potentially navigate away
    await this.assertNoUnknownRequiredFields(browserPage);

    // We run the engine to process the page
    // The engine handles observation, mapping, execution, and verification internally
    await engine.processPage(browserPage, candidate, resumePath);
  }

  async submit(page: unknown): Promise<SubmissionResult> {
    const browserPage = page as Page;

    const initialUrl = browserPage.url();
    if (initialUrl.includes('confirmation') || initialUrl.includes('success')) {
        return { confirmed: true, evidence: { confirmationUrl: initialUrl } };
    }

    const submitButtons = await browserPage.$$('button[type="submit"], input[type="submit"]');
    if (submitButtons.length > 0) {
      await submitButtons[0]?.click({ timeout: 5000 });
    } else {
       throw new Error('MISSING_SELECTOR:submit_button');
    }

    try {
        const confirmation = await browserPage.waitForSelector('text=/thank you|success|application submitted/i', { timeout: 10000 });
        const textContent = await confirmation.textContent();
        return {
          confirmed: true,
          evidence: {
            confirmationUrl: browserPage.url(),
            ...(textContent ? { confirmationText: textContent } : {})
          }
        };
    } catch {
        const url = browserPage.url();
        if (url.includes('confirmation') || url.includes('success')) {
            return { confirmed: true, evidence: { confirmationUrl: url } };
        }
        return { confirmed: false };
    }
  }

  private async assertNoUnknownRequiredFields(page: Page) {
    const missing = await page.$$eval('input[required], select[required], textarea[required]', (elements) =>
      elements
        .filter((element) => {
          const input = element as HTMLInputElement;
          if (input.type === 'checkbox' || input.type === 'radio') {
            return !input.checked;
          }
          return input.type !== 'hidden' && !input.value;
        })
        .map((element) => (element.getAttribute('name') || element.id || element.getAttribute('aria-label') || 'unknown'))
    );

    if (missing.length > 0) {
      throw new Error(`UNKNOWN_REQUIRED_FIELD:${missing.join(',')}`);
    }
  }
}
