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

export class LeverAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('jobs.lever.co') || url.includes('lever-');
  }

  async inspect(page: unknown, url: string): Promise<Record<string, unknown>> {
    const browserPage = page as Page;
    await browserPage.goto(url, { waitUntil: 'networkidle' });

    const applyButton = await browserPage.$('.postings-btn');
    if (applyButton) {
        await applyButton.click();
        await browserPage.waitForTimeout(500);
    }

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
    const candidate = profile as CandidateProfileForApplication;
    await browserPage.waitForSelector('input[name="name"]', { state: 'visible', timeout: 5000 });
    await browserPage.fill('input[name="name"]', candidate.name || '');
    await browserPage.fill('input[name="email"]', candidate.user?.email || '');

    if (candidate.phone) {
      await browserPage.fill('input[name="phone"]', candidate.phone);
    }

    if (candidate.linkedin) {
      const linkedinInput = await browserPage.$('input[name="urls[LinkedIn]"]');
      if (linkedinInput) await linkedinInput.fill(candidate.linkedin);
    }

    const fileInput = await browserPage.$('input[type="file"][name="resume"]');
    if (fileInput) {
        await fileInput.setInputFiles(resumePath);
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

    const radios = await browserPage.$$('input[type="radio"]');
    for (const radio of radios) {
      const labelText = await browserPage.evaluate((el) => {
        const id = el.getAttribute('id');
        if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) return label.textContent?.toLowerCase() || '';
        }
        const parentLabel = el.closest('label');
        if (parentLabel) {
            return parentLabel.textContent?.toLowerCase() || '';
        }
        return '';
      }, radio);

      if (labelText.includes('decline') || labelText.includes('prefer not') || labelText.includes('wish not')) {
         await radio.check();
      }
    }

    await this.assertNoUnknownRequiredFields(browserPage);
  }

  async submit(page: unknown): Promise<SubmissionResult> {
    const browserPage = page as Page;
    await browserPage.click('button[type="submit"].postings-btn');

    try {
        await browserPage.waitForURL('**/thanks', { timeout: 3000 });
        return { confirmed: true, evidence: { confirmationUrl: browserPage.url() } };
    } catch {
        await browserPage.waitForTimeout(500);
        const text = await browserPage.textContent('body');
        const confirmed = text?.includes('Application submitted') || text?.includes('Thank you') || false;

        const evidence: { confirmationUrl?: string; confirmationText?: string } = {
          confirmationUrl: browserPage.url()
        };
        if (text) {
          evidence.confirmationText = text;
        }

        return confirmed
          ? { confirmed: true, evidence }
          : { confirmed: false };
    }
  }

  private async assertNoUnknownRequiredFields(page: Page) {
    const missing = await page.$$eval('input[required], select[required], textarea[required]', (elements) =>
      elements
        .filter((element) => {
          const input = element as unknown as { type: string, value: string, getAttribute: (attr: string) => string | null, id: string };
          return input.type !== 'hidden' && !input.value;
        })
        .map((element) => (element.getAttribute('name') || element.id || element.getAttribute('aria-label') || 'unknown'))
    );
    if (missing.length > 0) {
      throw new Error(`UNKNOWN_REQUIRED_FIELD:${missing.join(',')}`);
    }
  }
}
