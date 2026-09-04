import { ApplicationAdapter } from '@autoapply/shared';
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
  }

  async submit(page: unknown): Promise<boolean> {
    const browserPage = page as Page;
    await browserPage.click('button[type="submit"].postings-btn');

    try {
        await browserPage.waitForURL('**/thanks', { timeout: 3000 });
        return true;
    } catch {
        await browserPage.waitForTimeout(500);
        const text = await browserPage.textContent('body');
        return text?.includes('Application submitted') || text?.includes('Thank you') || false;
    }
  }
}
