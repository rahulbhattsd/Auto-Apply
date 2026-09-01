import { ApplicationAdapter } from '@autoapply/shared';

export class LeverAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('jobs.lever.co') || url.includes('lever-');
  }

  async inspect(page: any, url: string): Promise<Record<string, unknown>> {
    await page.goto(url, { waitUntil: 'networkidle' });

    const applyButton = await page.$('.postings-btn');
    if (applyButton) {
        await applyButton.click();
        await page.waitForTimeout(500);
    }

    const captchaFrames = await page.$$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captchaFrames.length > 0) {
      throw new Error('CAPTCHA_DETECTED');
    }

    const mfaElements = await page.$$('input[name*="code"], input[name*="mfa"]');
    if (mfaElements.length > 0) {
        throw new Error('MFA_DETECTED');
    }

    const inputs = await page.$$eval('input, select, textarea', (els: any[]) =>
      els.map((el: any) => ({ name: el.name, type: el.type, id: el.id }))
    );

    return { inputs };
  }

  async fill(page: any, profile: any, resumePath: string): Promise<void> {
    await page.waitForSelector('input[name="name"]', { state: 'visible', timeout: 5000 });
    await page.fill('input[name="name"]', profile.name || '');
    await page.fill('input[name="email"]', profile.user?.email || '');

    if (profile.phone) {
      await page.fill('input[name="phone"]', profile.phone);
    }

    if (profile.linkedin) {
      const linkedinInput = await page.$('input[name="urls[LinkedIn]"]');
      if (linkedinInput) await linkedinInput.fill(profile.linkedin);
    }

    const fileInput = await page.$('input[type="file"][name="resume"]');
    if (fileInput) {
        await fileInput.setInputFiles(resumePath);
    }
  }

  async submit(page: any): Promise<boolean> {
    await page.click('button[type="submit"].postings-btn');

    try {
        await page.waitForURL('**/thanks', { timeout: 3000 });
        return true;
    } catch {
        await page.waitForTimeout(500);
        const text = await page.textContent('body');
        return text.includes('Application submitted') || text.includes('Thank you');
    }
  }
}
