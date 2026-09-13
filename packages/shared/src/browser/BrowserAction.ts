import { Page, Locator } from 'playwright';
import { ActionResult } from './types.js';

export class BrowserAction {
  constructor(private page: Page) {}

  private async verifyLocatorExists(locator: string): Promise<Locator | null> {
    const loc = this.page.locator(locator).first();
    try {
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      return loc;
    } catch {
      return null;
    }
  }

  async fill(locator: string, value: string): Promise<ActionResult> {
    try {
      const loc = await this.verifyLocatorExists(locator);
      if (!loc) return { success: false, error: 'Element not found or not visible', verified: false };

      await loc.fill(value);

      // Verify
      const actualValue = await loc.inputValue();
      const verified = actualValue === value;

      return { success: true, verified };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e), verified: false };
    }
  }

  async click(locator: string): Promise<ActionResult> {
    try {
      const loc = await this.verifyLocatorExists(locator);
      if (!loc) return { success: false, error: 'Element not found or not visible', verified: false };

      // Click might cause navigation, so we can't easily verify the element state after click
      // We rely on PageState changes later
      await loc.click();

      return { success: true, verified: true };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e), verified: false };
    }
  }

  async select(locator: string, value: string): Promise<ActionResult> {
    try {
      const loc = await this.verifyLocatorExists(locator);
      if (!loc) return { success: false, error: 'Element not found or not visible', verified: false };

      await loc.selectOption({ value });

      // Verify
      const actualValue = await loc.evaluate((el: Element) => (el as HTMLSelectElement).value);
      const verified = actualValue === value;

      return { success: true, verified };
    } catch (e: unknown) {
       return { success: false, error: e instanceof Error ? e.message : String(e), verified: false };
    }
  }

  async check(locator: string, checked: boolean): Promise<ActionResult> {
    try {
      const loc = await this.verifyLocatorExists(locator);
      if (!loc) return { success: false, error: 'Element not found or not visible', verified: false };

      if (checked) {
        await loc.check();
      } else {
        await loc.uncheck();
      }

      // Verify
      const actualValue = await loc.isChecked();
      const verified = actualValue === checked;

      return { success: true, verified };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e), verified: false };
    }
  }
}
