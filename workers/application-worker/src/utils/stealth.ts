import type { Page, BrowserContext } from 'playwright';

/**
 * Injects anti-bot stealth scripts to mask automated browser signatures.
 */
export async function applyStealthScripts(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // 1. Mask navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // 2. Mock plugins length
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // 3. Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // 4. Mock window.chrome runtime
    if (!(window as any).chrome) {
      (window as any).chrome = {
        runtime: {},
        app: {},
      };
    }

    // 5. Mock permissions query
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as any)
          : originalQuery(parameters);
    }
  });
}

/**
 * Human-like typing with randomized delays between keystrokes.
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) return;

  await element.click();
  for (const char of text) {
    await page.keyboard.type(char);
    // 30ms - 80ms delay per key
    const delay = Math.floor(Math.random() * 50) + 30;
    await page.waitForTimeout(delay);
  }
}
