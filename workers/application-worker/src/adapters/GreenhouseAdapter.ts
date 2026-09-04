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
    const candidate = profile as CandidateProfileForApplication;
    await browserPage.fill('input[name="first_name"]', candidate.name?.split(' ')[0] || '');
    await browserPage.fill('input[name="last_name"]', candidate.name?.split(' ').slice(1).join(' ') || '');
    await browserPage.fill('input[name="email"]', candidate.user?.email || '');

    if (candidate.phone) {
      await browserPage.fill('input[name="phone"]', candidate.phone);
    }

    if (candidate.linkedin) {
      const linkedinInput = await browserPage.$('input[name*="linkedin"]');
      if (linkedinInput) await linkedinInput.fill(candidate.linkedin);
    }

    const fileInput = await browserPage.$('input[type="file"][name*="resume"]');
    if (fileInput) {
        await fileInput.setInputFiles(resumePath);
    }
  }

  async submit(page: unknown): Promise<boolean> {
    const browserPage = page as Page;
    await browserPage.click('input[type="submit"], button[type="submit"], #submit_app');

    try {
        await browserPage.waitForSelector('h1:has-text("Thank you"), .application-success', { timeout: 10000 });
        return true;
    } catch {
        const url = browserPage.url();
        if (url.includes('confirmation') || url.includes('success')) {
            return true;
        }
        return false;
    }
  }
}
