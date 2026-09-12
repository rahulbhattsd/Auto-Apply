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

export class WorkdayAdapter implements ApplicationAdapter {
  canHandle(url: string): boolean {
    return url.includes('myworkdayjobs.com') || url.includes('workday');
  }

  async inspect(page: unknown, url: string): Promise<Record<string, unknown>> {
    const browserPage = page as Page;
    await browserPage.goto(url, { waitUntil: 'networkidle' });

    const content = await browserPage.content();
    if (content.includes('Create Account') || content.includes('Sign In') || content.includes('createAccount')) {
      throw new Error('ACCOUNT_REQUIRED');
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

    // Idempotency: Prevent duplicate filling if already on success page
    const url = browserPage.url();
    if (url.includes('confirmation') || url.includes('success')) {
        return;
    }

    let isLastStep = false;
    let stepCount = 0;
    const maxSteps = 10;

    while (!isLastStep && stepCount < maxSteps) {
      stepCount++;
      await browserPage.waitForTimeout(1000); // Wait for animations/transitions

      // Check if submit button is visible, indicating the last step
      const submitButton = await browserPage.$('[data-automation-id="bottom-navigation-submit-button"], button:has-text("Submit"), input[type="submit"]');
      if (submitButton && await submitButton.isVisible()) {
          isLastStep = true;
          // We don't click it here, submit() will do that. We just fill the last step and break.
      }

      // Fill common fields using workday's data-automation-ids
      const firstNameInput = await browserPage.$('[data-automation-id="legalNameSection_firstName"]');
      if (firstNameInput && await firstNameInput.isVisible() && await firstNameInput.inputValue() === '') {
          await firstNameInput.fill(candidate.name?.split(' ')[0] || '', { timeout: 2000 });
      }

      const lastNameInput = await browserPage.$('[data-automation-id="legalNameSection_lastName"]');
      if (lastNameInput && await lastNameInput.isVisible() && await lastNameInput.inputValue() === '') {
          await lastNameInput.fill(candidate.name?.split(' ').slice(1).join(' ') || '', { timeout: 2000 });
      }

      const emailInput = await browserPage.$('[data-automation-id="email"]');
      if (emailInput && await emailInput.isVisible() && await emailInput.inputValue() === '') {
          await emailInput.fill(candidate.user?.email || '', { timeout: 2000 });
      }

      const fileInput = await browserPage.$('input[type="file"]');
      if (fileInput) {
          // Check if file is already uploaded, not strictly necessary if we can't tell, but safe to attempt
          try {
             await fileInput.setInputFiles(resumePath, { timeout: 2000 });
          } catch {
             // Ignore error if file input is obscured or already has a file
          }
      }

      // Handle voluntary EEO fields (Decline to answer)
      await this.fillVoluntaryFields(browserPage);

      // Check for unknown required fields BEFORE clicking next
      await this.assertNoUnknownRequiredFields(browserPage);

      if (!isLastStep) {
          // Click Next/Continue
          const nextButton = await browserPage.$('[data-automation-id="bottom-navigation-next-button"], button:has-text("Next"), button:has-text("Continue")');
          if (nextButton && await nextButton.isVisible()) {
              await nextButton.click();
          } else {
              // If we can't find Next or Submit, and it's not the last step, something is wrong
              break;
          }
      }
    }
  }

  async submit(page: unknown): Promise<SubmissionResult> {
    const browserPage = page as Page;

    // Idempotency check before click
    const initialUrl = browserPage.url();
    if (initialUrl.includes('confirmation') || initialUrl.includes('success')) {
        return { confirmed: true, evidence: { confirmationUrl: initialUrl } };
    }

    const submitButton = await browserPage.$('[data-automation-id="bottom-navigation-submit-button"], button:has-text("Submit"), input[type="submit"]');
    if (!submitButton) {
        throw new Error('MISSING_SELECTOR:submit_button');
    }

    await submitButton.click({ timeout: 5000 });

    try {
        const confirmation = await browserPage.waitForSelector('text=/thank you|success|congratulations|submitted/i', { timeout: 10000 });
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

  private async fillVoluntaryFields(page: Page) {
    const selects = await page.$$('select');
    for (const select of selects) {
      if (!await select.isVisible()) continue;

      const id = await select.getAttribute('id') || '';
      const name = await select.getAttribute('name') || '';
      const dataAutomationId = await select.getAttribute('data-automation-id') || '';

      const labelText = await page.evaluate((el) => {
        const id = el.getAttribute('id');
        if (!id) return '';
        const label = document.querySelector(`label[for="${id}"]`);
        return label ? label.textContent?.toLowerCase() || '' : '';
      }, select);

      const combinedText = `${id} ${name} ${dataAutomationId} ${labelText}`.toLowerCase();

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

    const radios = await page.$$('input[type="radio"]');
    for (const radio of radios) {
      if (!await radio.isVisible()) continue;

      const id = await radio.getAttribute('id') || '';
      const name = await radio.getAttribute('name') || '';

      const labelText = await page.evaluate((el) => {
        const id = el.getAttribute('id');
        if (id) {
           const label = document.querySelector(`label[for="${id}"]`);
           if (label) return label.textContent?.toLowerCase() || '';
        }

        const parentLabel = el.closest('label');
        if (parentLabel) return parentLabel.textContent?.toLowerCase() || '';

        return '';
      }, radio);

      const combinedText = `${id} ${name} ${labelText}`.toLowerCase();

      if (combinedText.includes('decline') || combinedText.includes('prefer not') || combinedText.includes('wish not')) {
         // Check if this radio belongs to a group that is EEO related
         const groupText = await page.evaluate((el) => {
             const group = el.closest('[role="group"], fieldset, div[data-automation-id*="eeo"], div[class*="eeo"]');
             return group ? group.textContent?.toLowerCase() || '' : '';
         }, radio);

         const isEeoRelatedGroup = groupText.includes('gender') || groupText.includes('race') || groupText.includes('veteran') || groupText.includes('disability') || groupText.includes('eeo');
         const isNameOrIdEeoRelated = combinedText.includes('gender') || combinedText.includes('race') || combinedText.includes('veteran') || combinedText.includes('disability') || combinedText.includes('eeo');

         if (isEeoRelatedGroup || isNameOrIdEeoRelated) {
            await radio.check();
         }
      }
    }
  }

  private async assertNoUnknownRequiredFields(page: Page) {
    const missing = await page.$$eval('input[required], select[required], textarea[required], input[aria-required="true"], select[aria-required="true"], textarea[aria-required="true"]', (elements) =>
      elements
        .filter((element) => {
          // Check visibility
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;

          const input = element as unknown as { type: string, value: string, checked?: boolean };
          if (input.type === 'radio' || input.type === 'checkbox') {
             // For radio groups, we need to check if ANY in the group is checked, this is simplified
             // but we'll assume if it's explicitly required, it needs checking.
             // Actually, for radio groups, the required attribute is usually on all of them, but only one needs to be checked.
             // It's tricky to evaluate radio groups perfectly here without more context.
             // Let's assume if it's a radio and required, and none with the same name are checked, it's missing.
             const el = element as HTMLInputElement;
             if (el.name) {
                 // page.$$eval runs this function in the browser, so we can't use await page.evaluate here.
                 // We can simply query the document directly.
                 const group = document.querySelectorAll(`input[name="${el.name}"]`);
                 const isChecked = Array.from(group).some(r => (r as HTMLInputElement).checked);
                 return !isChecked;
             }
             return !input.checked;
          }
          return input.type !== 'hidden' && !input.value;
        })
        .map((element) => (element.getAttribute('name') || element.id || element.getAttribute('data-automation-id') || element.getAttribute('aria-label') || 'unknown'))
    );
    if (missing.length > 0) {
      throw new Error(`UNKNOWN_REQUIRED_FIELD:${missing.join(',')}`);
    }
  }
}
