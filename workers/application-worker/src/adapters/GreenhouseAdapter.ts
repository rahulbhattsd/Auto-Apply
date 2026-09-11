import { ApplicationAdapter, SubmissionResult } from '@autoapply/shared';
import type { Page } from 'playwright';

type CandidateProfileForApplication = {
  name?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  user?: {
    email?: string | null;
  } | null;
};

export class GreenhouseAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('boards.greenhouse.io');
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

    const inputs = await browserPage.$$eval('input, select, textarea', (els) =>
      els.map((el) => {
        const field = el as unknown as Record<string, string | undefined>;
        return { name: field['name'], type: field['type'] || field['tagName']?.toLowerCase(), id: field['id'] };
      })
    );

    return { inputs };
  }

  async fill(page: unknown, profile: unknown, resumePath: string): Promise<void> {
    const browserPage = page as Page;

    // Idempotency: Prevent duplicate filling if already on success page
    const url = browserPage.url();
    if (url.includes('confirmation') || url.includes('success')) {
        return;
    }

    const candidate = profile as CandidateProfileForApplication;
    await browserPage.waitForSelector('input[name="first_name"]', { state: 'visible', timeout: 5000 }).catch(() => { throw new Error('MISSING_SELECTOR:input[name="first_name"]'); });
    await browserPage.fill('input[name="first_name"]', candidate.name?.split(' ')[0] || '', { timeout: 5000 });
    await browserPage.fill('input[name="last_name"]', candidate.name?.split(' ').slice(1).join(' ') || '', { timeout: 5000 });
    await browserPage.fill('input[name="email"]', candidate.user?.email || '', { timeout: 5000 });

    if (candidate.phone) {
      await browserPage.fill('input[name="phone"]', candidate.phone, { timeout: 5000 });
    }

    if (candidate.linkedin) {
      const linkedinInput = await browserPage.$('input[name*="linkedin"]');
      if (linkedinInput) await linkedinInput.fill(candidate.linkedin, { timeout: 5000 });
    }

    const fileInput = await browserPage.$('input[type="file"][name*="resume"]');
    if (fileInput) {
        await fileInput.setInputFiles(resumePath, { timeout: 5000 });
    } else {
        throw new Error('MISSING_SELECTOR:input[type="file"]');
    }

    // Handle voluntary EEO fields (Decline to answer)
    const selects = await browserPage.$$('select');
    for (const select of selects) {
      const id = await select.getAttribute('id') || '';
      const name = await select.getAttribute('name') || '';
      const labelText = await browserPage.evaluate((el) => {
        const id = el.getAttribute('id');
        if (!id) return '';
        const label = document.querySelector(`label[for="${id}"]`);
        return label ? label.textContent?.toLowerCase() || '' : '';
      }, select);

      const combinedText = `${id} ${name} ${labelText}`.toLowerCase();

      if (combinedText.includes('gender') || combinedText.includes('race') || combinedText.includes('veteran') || combinedText.includes('disability') || combinedText.includes('eeo') || combinedText.includes('voluntary')) {
        const options = await select.$$('option');
        for (const option of options) {
          const text = await option.textContent() || '';
          const lowerText = text.toLowerCase();
          if (lowerText.includes('decline') || lowerText.includes('prefer not') || lowerText.includes('wish not')) {
             const value = await option.getAttribute('value');
             if (value) {
                await select.selectOption(value);
             }
             break;
          }
        }
      }
    }

    await this.assertNoUnknownRequiredFields(browserPage);
  }

  async submit(page: unknown): Promise<SubmissionResult> {
    const browserPage = page as Page;

    // Idempotency check before click
    const initialUrl = browserPage.url();
    if (initialUrl.includes('confirmation') || initialUrl.includes('success')) {
        return { confirmed: true, evidence: { confirmationUrl: initialUrl } };
    }

    await browserPage.click('input[type="submit"], button[type="submit"], #submit_app', { timeout: 5000 }).catch(() => { throw new Error('MISSING_SELECTOR:submit_button'); });

    try {
        const confirmation = await browserPage.waitForSelector('h1:has-text("Thank you"), .application-success', { timeout: 10000 });
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
          const input = element as unknown as { type: string, value: string };
          return input.type !== 'hidden' && !input.value;
        })
        .map((element) => (element.getAttribute('name') || element.id || element.getAttribute('aria-label') || 'unknown'))
    );
    if (missing.length > 0) {
      throw new Error(`UNKNOWN_REQUIRED_FIELD:${missing.join(',')}`);
    }
  }
}
