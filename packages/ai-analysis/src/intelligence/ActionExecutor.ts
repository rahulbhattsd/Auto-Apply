import { BrowserAction } from '@autoapply/shared/src/browser/BrowserAction.js';
import { PlannedAction } from './types.js';
import { Page } from 'playwright';

export class ActionExecutor {
  constructor(private browserAction: BrowserAction, private page: Page) {}

  async execute(actions: PlannedAction[], resumePath?: string): Promise<boolean> {
    for (const action of actions) {
      if (!action.locator && action.type !== 'wait') {
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
            case 'upload':
              if (resumePath) {
                 const locator = this.page.locator(action.locator!).first();
                 await locator.setInputFiles(resumePath, { timeout: 5000 });
                 success = true; // Hard to verify without knowing DOM specifics, assume true if it didn't throw
              } else {
                 console.warn('Skipping upload action because resumePath is not provided.');
                 success = true;
              }
              break;
            case 'click':
              {
                const res = await this.browserAction.click(action.locator!);
                success = res.verified;
                // Give the page a moment to navigate or mutate
                await this.page.waitForTimeout(1000);
              }
              break;
            default:
              success = true; // Unhandled action type, skip
          }
        } catch (e) {
          console.warn(`Action failed: ${action.description}`, e);
          success = false;
        }

        if (!success) {
          retries--;
          if (retries > 0) {
            console.log(`Retrying action: ${action.description}`);
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
