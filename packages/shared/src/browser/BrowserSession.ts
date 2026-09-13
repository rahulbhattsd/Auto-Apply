import { Browser, BrowserContext, Page, chromium } from 'playwright';

export interface BrowserConfig {
  headless?: boolean;
  navigationTimeout?: number;
  actionTimeout?: number;
  launchTimeout?: number;
}

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private config: BrowserConfig = {}) {}

  async launch(): Promise<Page> {
    const launchTimeout = this.config.launchTimeout ?? 30000;

    // Attempt launch with timeout
    this.browser = await Promise.race([
      chromium.launch({ headless: this.config.headless ?? true }),
      new Promise<Browser>((_, reject) => setTimeout(() => reject(new Error('Browser launch timeout')), launchTimeout))
    ]);

    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    if (this.config.navigationTimeout) {
      this.page.setDefaultNavigationTimeout(this.config.navigationTimeout);
    }

    if (this.config.actionTimeout) {
      this.page.setDefaultTimeout(this.config.actionTimeout);
    }

    return this.page;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched');
    }
    return this.page;
  }

  async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
    } catch (e) {
      console.error('Error closing page', e);
    }

    try {
      if (this.context) {
        await this.context.close();
      }
    } catch (e) {
      console.error('Error closing context', e);
    }

    try {
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close();
      }
    } catch (e) {
      console.error('Error closing browser', e);
    }

    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
