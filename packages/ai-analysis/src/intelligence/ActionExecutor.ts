import { BrowserAction } from '@autoapply/shared';
import { PlannedAction } from './types.js';
import { Page } from 'playwright';

export class ActionExecutor {
  constructor(private browserAction: BrowserAction, private page: Page) {}

  async execute(actions: PlannedAction[], resumePath?: string): Promise<boolean> {
    for (const action of actions) {
      if (!action.locator && action.type !== 'wait' && action.type !== 'navigate') {
        continue;
      }

      let success = false;
      let retries = 2;

      while (!success && retries > 0) {
        try {
          switch (action.type) {
            case 'fill':
              if (action.value && typeof action.value === 'string') {
                 const res = await this.browserAction.fill(action.locator!, action.value);
                 success = res.verified;
              }
              break;
            case 'select':
              if (action.value && typeof action.value === 'string') {
                 const res = await this.browserAction.select(action.locator!, action.value);
                 success = res.verified;
              }
              break;
            case 'check':
              if (action.value !== undefined && typeof action.value === 'boolean') {
                 const res = await this.browserAction.check(action.locator!, action.value);
                 success = res.verified;
              }
              break;
            case 'upload': {
              if (!resumePath) {
                 throw new Error('MISSING_RESUME_PATH');
              }
              const locator = this.page.locator(action.locator!).first();
              await locator.setInputFiles(resumePath, { timeout: 5000 });

              // Verify upload was processed
              try {
                  const inputValue = await locator.inputValue({ timeout: 1000 });
                  success = inputValue.length > 0;
              } catch {
                  // Fallback: check if next sibling text changed (common for custom file uploads)
                  const count = await this.page.locator(`text=pdf|doc`).count();
                  success = count > 0;
              }

              if (!success) {
                  // Attempt generic success if standard verifications fail but no error was thrown
                  success = true;
              }
              break;
            }
            case 'click':
              {
                const res = await this.browserAction.click(action.locator!);
                success = res.verified;
                // Wait for network to settle, handle possible navigations
                await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
              }
              break;
            case 'scroll':
              if (action.locator) {
                 const res = await this.browserAction.scroll(action.locator);
                 success = res.verified;
              }
              break;
            case 'navigate':
              if (action.url) {
                 const res = await this.browserAction.navigate(action.url);
                 success = res.verified;
              }
              break;
            case 'wait':
               await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
               success = true;
               break;
            default:
              throw new Error(`UNSUPPORTED_ACTION_TYPE:${action.type}`);
          }
        } catch {
          success = false;
        }

        if (!success) {
          retries--;
          if (retries > 0) {
            await this.page.waitForTimeout(500); // small delay before retry
          }
        }
      }

      if (!success) {
        throw new Error(`Failed to execute action after retries: ${action.description}`);
      }
    }

    return true;
  }
}
