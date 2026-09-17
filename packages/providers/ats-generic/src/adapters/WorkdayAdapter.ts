import { ApplicationAdapter, SubmissionResult, ApplicationOutcome } from '@autoapply/shared';
import type { Page } from 'playwright';
import type { CandidateProfileForApplication } from './GreenhouseAdapter.js';

export class WorkdayAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('myworkdayjobs.com') || url.includes('workday.com');
  }

  async inspect(page: unknown, url: string): Promise<Record<string, unknown>> {
    const browserPage = page as Page;
    await browserPage.goto(url, { waitUntil: 'networkidle' });

    // Check CAPTCHA
    const captchaFrames = await browserPage.$$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]');
    if (captchaFrames.length > 0) {
      throw new Error('CAPTCHA_DETECTED');
    }

    // Check MFA
    const mfaElements = await browserPage.$$('input[name*="code" i], input[name*="mfa" i], input[name*="otp" i], input[id*="otp" i], input[name*="2fa" i], input[autocomplete="one-time-code"]');
    if (mfaElements.length > 0) {
      throw new Error('MFA_DETECTED');
    }

    // Check if account is required (sign-in gate)
    const signInGate = await browserPage.$('[data-automation-id="signInSubmitButton"], button:has-text("Sign In"), a:has-text("Sign In")');
    const isApplyPage = await browserPage.$('[data-automation-id="applyButton"], [data-automation-id="bottom-navigation-next-button"]');
    if (signInGate && !isApplyPage) {
      throw new Error('ACCOUNT_REQUIRED');
    }

    const inputs = await browserPage.$$eval('input, select, textarea', (els) =>
      els.map((el) => {
        const field = el as unknown as Record<string, string | undefined>;
        return { name: field['name'], type: field['type'] || field['tagName']?.toLowerCase(), id: field['id'] };
      })
    );

    return { inputs };
  }

  async fill(page: unknown, profile: unknown, resumePath: string): Promise<ApplicationOutcome> {
    const browserPage = page as Page;
    const candidate = profile as CandidateProfileForApplication;

    // Check account gate
    const signInButton = await browserPage.$('[data-automation-id="signInSubmitButton"]');
    if (signInButton) {
      throw new Error('ACCOUNT_REQUIRED');
    }

    // Multi-step loop: Workday usually has 3-5 steps (My Information, My Experience, Application Questions, Voluntary Disclosures, Review)
    const maxSteps = 7;
    for (let step = 0; step < maxSteps; step++) {
      await browserPage.waitForTimeout(500);

      // Check if we reached the final Review / Submit page
      const submitButton = await browserPage.$('[data-automation-id="bottom-navigation-submit-button"], button:has-text("Submit")');
      const isLastStep = submitButton && (await submitButton.isVisible());

      // Fill common candidate fields on current step if present
      const firstNameInput = await browserPage.$('[data-automation-id="legalNameSection_firstName"], input[name*="firstName" i]');
      if (firstNameInput && (await firstNameInput.isVisible()) && (await firstNameInput.inputValue()) === '') {
        await firstNameInput.fill(candidate.name?.split(' ')[0] || '', { timeout: 2000 });
      }

      const lastNameInput = await browserPage.$('[data-automation-id="legalNameSection_lastName"], input[name*="lastName" i]');
      if (lastNameInput && (await lastNameInput.isVisible()) && (await lastNameInput.inputValue()) === '') {
        await lastNameInput.fill(candidate.name?.split(' ').slice(1).join(' ') || '', { timeout: 2000 });
      }

      const phoneInput = await browserPage.$('[data-automation-id="phone-number"], input[type="tel"]');
      if (phoneInput && (await phoneInput.isVisible()) && (await phoneInput.inputValue()) === '') {
        if (candidate.phone) {
          await phoneInput.fill(candidate.phone, { timeout: 2000 });
        }
      }

      const email = candidate.user?.email || candidate.email || '';
      const emailInput = await browserPage.$('[data-automation-id="email"], input[type="email"]');
      if (emailInput && (await emailInput.isVisible()) && (await emailInput.inputValue()) === '') {
        await emailInput.fill(email, { timeout: 2000 });
      }

      const fileInput = await browserPage.$('input[type="file"]');
      if (fileInput) {
        try {
          await fileInput.setInputFiles(resumePath, { timeout: 2000 });
        } catch {
          // Ignore if file input is obscured or already has a file
        }
      }

      // Handle voluntary EEO fields (Decline to answer)
      await this.fillVoluntaryFields(browserPage);

      // Check for unknown required fields BEFORE clicking next
      await this.assertNoUnknownRequiredFields(browserPage);

      if (!isLastStep) {
        // Click Next/Continue
        const nextButton = await browserPage.$('[data-automation-id="bottom-navigation-next-button"], button:has-text("Next"), button:has-text("Continue")');
        if (nextButton && (await nextButton.isVisible())) {
          await nextButton.click();
        } else {
          break;
        }
      }
    }

    return {
      type: 'READY_TO_SUBMIT',
      submitLocator: '[data-automation-id="bottom-navigation-submit-button"], button:has-text("Submit"), input[type="submit"]',
    };
  }

  async submit(page: unknown, submitLocator?: string): Promise<SubmissionResult> {
    const browserPage = page as Page;

    // Idempotency check before click
    const initialUrl = browserPage.url();
    if (initialUrl.includes('confirmation') || initialUrl.includes('success')) {
      return { confirmed: true, evidence: { confirmationUrl: initialUrl } };
    }

    if (!submitLocator) {
      submitLocator = '[data-automation-id="bottom-navigation-submit-button"], button:has-text("Submit"), input[type="submit"]';
    }

    const submitButton = await browserPage.$(submitLocator);
    if (!submitButton) {
      throw new Error('MISSING_SELECTOR:submit_button');
    }

    await submitButton.click({ timeout: 5000 });

    try {
      const confirmation = await browserPage.waitForSelector('text=/thank you|success|congratulations|submitted/i', {
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

  private async fillVoluntaryFields(page: Page) {
    const selects = await page.$$('select');
    for (const select of selects) {
      if (!(await select.isVisible())) continue;

      const id = (await select.getAttribute('id')) || '';
      const name = (await select.getAttribute('name')) || '';
      const dataAutomationId = (await select.getAttribute('data-automation-id')) || '';

      const labelText = await page.evaluate((el) => {
        const idAttr = el.getAttribute('id');
        if (!idAttr) return '';
        const label = document.querySelector(`label[for="${idAttr}"]`);
        return label ? label.textContent?.toLowerCase() || '' : '';
      }, select);

      const combinedText = `${id} ${name} ${dataAutomationId} ${labelText}`.toLowerCase();

      if (
        combinedText.includes('gender') ||
        combinedText.includes('race') ||
        combinedText.includes('veteran') ||
        combinedText.includes('disability') ||
        combinedText.includes('eeo') ||
        combinedText.includes('voluntary')
      ) {
        const options = await select.$$('option');
        for (const option of options) {
          const text = (await option.textContent()) || '';
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

    const radios = await page.$$('input[type="radio"]');
    for (const radio of radios) {
      if (!(await radio.isVisible())) continue;

      const id = (await radio.getAttribute('id')) || '';
      const name = (await radio.getAttribute('name')) || '';

      const labelText = await page.evaluate((el) => {
        const idAttr = el.getAttribute('id');
        if (idAttr) {
          const label = document.querySelector(`label[for="${idAttr}"]`);
          if (label) return label.textContent?.toLowerCase() || '';
        }
        const parentLabel = el.closest('label');
        if (parentLabel) return parentLabel.textContent?.toLowerCase() || '';
        return '';
      }, radio);

      const combinedText = `${id} ${name} ${labelText}`.toLowerCase();

      if (combinedText.includes('decline') || combinedText.includes('prefer not') || combinedText.includes('wish not')) {
        const groupText = await page.evaluate((el) => {
          const group = el.closest('[role="group"], fieldset, div[data-automation-id*="eeo"], div[class*="eeo"]');
          return group ? group.textContent?.toLowerCase() || '' : '';
        }, radio);

        const isEeoRelatedGroup =
          groupText.includes('gender') ||
          groupText.includes('race') ||
          groupText.includes('veteran') ||
          groupText.includes('disability') ||
          groupText.includes('eeo');
        const isNameOrIdEeoRelated =
          combinedText.includes('gender') ||
          combinedText.includes('race') ||
          combinedText.includes('veteran') ||
          combinedText.includes('disability') ||
          combinedText.includes('eeo');

        if (isEeoRelatedGroup || isNameOrIdEeoRelated) {
          await radio.check();
        }
      }
    }
  }

  private async assertNoUnknownRequiredFields(page: Page) {
    const missing = await page.$$eval(
      'input[required], select[required], textarea[required], input[aria-required="true"], select[aria-required="true"], textarea[aria-required="true"]',
      (elements) =>
        elements
          .filter((element) => {
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;

            const input = element as unknown as { type: string; value: string; checked?: boolean };
            if (input.type === 'radio' || input.type === 'checkbox') {
              const el = element as HTMLInputElement;
              if (el.name) {
                const group = document.querySelectorAll(`input[name="${el.name}"]`);
                const isChecked = Array.from(group).some((r) => (r as HTMLInputElement).checked);
                return !isChecked;
              }
              return !input.checked;
            }
            return input.type !== 'hidden' && !input.value;
          })
          .map(
            (element) =>
              element.getAttribute('name') ||
              element.id ||
              element.getAttribute('data-automation-id') ||
              element.getAttribute('aria-label') ||
              'unknown'
          )
    );
    if (missing.length > 0) {
      throw new Error(`UNKNOWN_REQUIRED_FIELD:${missing.join(',')}`);
    }
  }
}
