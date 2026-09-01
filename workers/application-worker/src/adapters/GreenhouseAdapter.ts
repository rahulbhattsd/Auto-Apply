import { ApplicationAdapter } from '@autoapply/shared';

export class GreenhouseAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('boards.greenhouse.io');
  }

  async inspect(page: any, url: string): Promise<Record<string, unknown>> {
    await page.goto(url, { waitUntil: 'networkidle' });

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
    await page.fill('input[name="first_name"]', profile.name?.split(' ')[0] || '');
    await page.fill('input[name="last_name"]', profile.name?.split(' ').slice(1).join(' ') || '');
    await page.fill('input[name="email"]', profile.user?.email || '');

    if (profile.phone) {
      await page.fill('input[name="phone"]', profile.phone);
    }

    if (profile.linkedin) {
      const linkedinInput = await page.$('input[name*="linkedin"]');
      if (linkedinInput) await linkedinInput.fill(profile.linkedin);
    }

    const fileInput = await page.$('input[type="file"][name*="resume"]');
    if (fileInput) {
        await fileInput.setInputFiles(resumePath);
    }
  }

  async submit(page: any): Promise<boolean> {
    await page.click('input[type="submit"], button[type="submit"], #submit_app');

    try {
        await page.waitForSelector('h1:has-text("Thank you"), .application-success', { timeout: 10000 });
        return true;
    } catch {
        const url = page.url();
        if (url.includes('confirmation') || url.includes('success')) {
            return true;
        }
        return false;
    }
  }
}
