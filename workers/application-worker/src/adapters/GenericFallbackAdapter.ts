import { ApplicationAdapter, SubmissionResult } from '@autoapply/shared';
import type { Page } from 'playwright';
import { FieldMappingProvider, FormField } from '@autoapply/ai-analysis';
import { connection } from '@autoapply/queue';
import { env } from '@autoapply/config';
import crypto from 'crypto';

type CandidateProfileForApplication = {
  name?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  user?: {
    email?: string | null;
  } | null;
  [key: string]: any;
};

export class GenericFallbackAdapter implements ApplicationAdapter {
  private fieldMappingProvider = new FieldMappingProvider();

  canHandle(_url: string): boolean {
    return true; // Fallback handles everything else
  }

  async inspect(page: unknown, _url: string): Promise<Record<string, unknown>> {
    const browserPage = page as Page;
    await browserPage.goto(_url, { waitUntil: 'networkidle' });

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

    // Extract fields again just to be sure we have the current state
    const { inputs } = await this.inspect(page, url) as { inputs: FormField[] };

    if (inputs.length === 0) {
      console.log('No form fields found to fill.');
      return;
    }

    const formSignature = crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
    const cacheKey = `ai-mapping:${formSignature}`;

    let mapping: Record<string, string> | null = null;

    const cached = await connection.get(cacheKey);
    if (cached) {
      mapping = JSON.parse(cached);
    } else {
      // Rate limiting check
      const dateStr = new Date().toISOString().split('T')[0];
      const rateLimitKey = `ai-mapping-limit:${dateStr}`;
      const count = await connection.incr(rateLimitKey);

      if (count === 1) {
        await connection.expire(rateLimitKey, 86400); // Expire after 24 hours
      }

      if (count > env.MAX_APPLICATIONS_PER_DAY) {
        throw new Error(`Exceeded generic adapter AI mapping limit for today (${env.MAX_APPLICATIONS_PER_DAY})`);
      }

      const result = await this.fieldMappingProvider.mapFields(inputs, candidate);
      mapping = result.mapping;

      await connection.set(cacheKey, JSON.stringify(mapping), 'EX', 86400); // Cache for 24h
    }

    if (!mapping) {
      throw new Error('Failed to generate or retrieve field mapping');
    }

    // Hallucination Guard: Filter out mapped values that aren't derived from candidate data
    const candidateDataString = JSON.stringify(candidate).toLowerCase();
    const validatedMapping: Record<string, string> = {};

    for (const [selector, value] of Object.entries(mapping)) {
      if (typeof value !== 'string') continue;

      if (!value.trim()) continue;

      if (candidateDataString.includes(value.toLowerCase())) {
        validatedMapping[selector] = value;
      } else {
        console.warn(`Hallucination Guard: Rejected mapping for selector '${selector}' with value '${value}' (not found in candidate profile)`);
      }
    }

    // Apply mappings
    for (const [selector, value] of Object.entries(validatedMapping)) {
      try {
        const element = await browserPage.$(selector);
        if (element) {
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          if (tagName === 'select') {
            await browserPage.selectOption(selector, value, { timeout: 2000 });
          } else {
             await browserPage.fill(selector, value, { timeout: 2000 });
          }
        }
      } catch (e) {
        console.warn(`Failed to fill selector ${selector}:`, e);
      }
    }

    try {
       const fileInput = await browserPage.$('input[type="file"]');
       if (fileInput) {
          await fileInput.setInputFiles(resumePath, { timeout: 5000 });
       }
    } catch (e) {
       console.log('No file input found or failed to upload resume.');
    }

    await this.assertNoUnknownRequiredFields(browserPage, inputs);
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

  private async assertNoUnknownRequiredFields(page: Page, _inputs: FormField[]) {
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
