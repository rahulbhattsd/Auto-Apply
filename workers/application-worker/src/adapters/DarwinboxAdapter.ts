import { ApplicationAdapter, SubmissionResult } from '@autoapply/shared';
import type { Page, Frame } from 'playwright';

type CandidateProfileForApplication = {
  name?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  expectedCtc?: string | null;
  noticePeriod?: string | null;
  user?: {
    email?: string | null;
  } | null;
};

export class DarwinboxAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('darwinbox.in') || url.includes('darwinbox.com');
  }

  async inspect(page: unknown, url: string): Promise<Record<string, unknown>> {
    const browserPage = page as Page;
    await browserPage.goto(url, { waitUntil: 'networkidle' });

    // Check for iframes
    const frames = browserPage.frames();
    const frame = frames.find(f => f.url().includes('darwinbox')) || browserPage;

    const captchaFrames = await frame.$$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captchaFrames.length > 0) {
      throw new Error('CAPTCHA_DETECTED');
    }

    const mfaElements = await frame.$$('input[name*="mfa"], input[id*="mfa"]');
    if (mfaElements.length > 0) {
        throw new Error('MFA_DETECTED');
    }

    const inputs = await frame.$$eval('input, select, textarea', (els) =>
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

    const frames = browserPage.frames();
    const frame = frames.find(f => f.url().includes('darwinbox')) || browserPage;

    // Fill basic details
    await frame.fill('input[name*="name"], input[id*="name"]', candidate.name || '', { timeout: 5000 }).catch(() => {});
    await frame.fill('input[name*="email"], input[id*="email"]', candidate.user?.email || '', { timeout: 5000 }).catch(() => {});

    if (candidate.phone) {
      await frame.fill('input[name*="phone"], input[id*="phone"]', candidate.phone, { timeout: 5000 }).catch(() => {});
    }

    if (candidate.linkedin) {
      await frame.fill('input[name*="linkedin"], input[id*="linkedin"]', candidate.linkedin, { timeout: 5000 }).catch(() => {});
    }

    const fileInput = await frame.$('input[type="file"]');
    if (fileInput) {
        await fileInput.setInputFiles(resumePath, { timeout: 5000 });
    }

    // CTC and Notice Period handling
    await this.handleCTCAndNoticePeriod(frame, candidate);

    await this.assertNoUnknownRequiredFields(frame);
  }

  private async handleCTCAndNoticePeriod(frame: Page | Frame, candidate: CandidateProfileForApplication) {
    // Attempt to fill CTC and notice period if candidate has them
    if (candidate.expectedCtc) {
      await frame.fill('input[name*="ctc" i], input[id*="ctc" i]', candidate.expectedCtc, { timeout: 1000 }).catch(() => {});
    }
    if (candidate.noticePeriod) {
      await frame.fill('input[name*="notice" i], input[id*="notice" i]', candidate.noticePeriod, { timeout: 1000 }).catch(() => {});
    }

    // Look for CTC or notice period fields that are required. If found and not filled, throw UNKNOWN_REQUIRED_FIELD.
    const missing = await frame.$$eval('input[required], select[required]', (elements) =>
        elements
          .filter((element) => {
            const input = element as unknown as { type: string, value: string, getAttribute: (attr: string) => string | null, id: string };
            const nameOrId = (input.getAttribute('name') || input.id || '').toLowerCase();
            return input.type !== 'hidden' && !input.value && (nameOrId.includes('ctc') || nameOrId.includes('notice'));
          })
          .map((element) => (element.getAttribute('name') || element.id || 'unknown'))
      );
      if (missing.length > 0) {
        throw new Error(`UNKNOWN_REQUIRED_FIELD:${missing.join(',')}`);
      }
  }

  async submit(page: unknown): Promise<SubmissionResult> {
    const browserPage = page as Page;
    const frames = browserPage.frames();
    const frame = frames.find(f => f.url().includes('darwinbox')) || browserPage;

    await frame.click('button[type="submit"], input[type="submit"]', { timeout: 5000 }).catch(() => { throw new Error('MISSING_SELECTOR:submit_button'); });

    try {
        await browserPage.waitForURL(/success|confirmation/i, { timeout: 10000 });
        const url = browserPage.url();
        const confirmationIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/); // Simple regex to catch id if available in URL
        const confirmationText = await browserPage.textContent('body');

        return {
          confirmed: true,
          evidence: {
            confirmationUrl: url,
            ...(confirmationText ? { confirmationText } : {}),
            ...(confirmationIdMatch ? { referenceId: confirmationIdMatch[1] } : {})
          }
        };
    } catch {
        const text = await browserPage.textContent('body');
        const confirmed = text?.includes('submitted') || text?.includes('Thank you') || text?.includes('success') || false;

        let referenceId = undefined;
        if (confirmed) {
             const refMatch = text?.match(/(?:reference|application|confirmation)\s*(?:id|no|number)?\s*[:#]\s*([A-Z0-9-]+)/i);
             if (refMatch) {
                 referenceId = refMatch[1];
             }
        }

        return confirmed
          ? { confirmed: true, evidence: { confirmationUrl: browserPage.url(), ...(text ? { confirmationText: text } : {}), ...(referenceId ? { referenceId } : {}) } }
          : { confirmed: false };
    }
  }

  private async assertNoUnknownRequiredFields(frame: Page | Frame) {
    const missing = await frame.$$eval('input[required], select[required], textarea[required]', (elements) =>
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
