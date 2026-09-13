import { BrowserSession, BrowserConfig } from './BrowserSession.js';
import { PageObserver } from './PageObserver.js';
import { BrowserAction } from './BrowserAction.js';
import { PageObservation } from './types.js';

export class BrowserAgent {
  private session: BrowserSession;
  private observer: PageObserver | null = null;
  private action: BrowserAction | null = null;

  constructor(config: BrowserConfig = {}) {
    this.session = new BrowserSession(config);
  }

  async init() {
    const page = await this.session.launch();
    this.observer = new PageObserver(page);
    this.action = new BrowserAction(page);
  }

  async close() {
    await this.session.close();
  }

  getPage() {
    return this.session.getPage();
  }

  async observe(): Promise<PageObservation> {
    if (!this.observer) throw new Error('Agent not initialized');
    return this.observer.observe();
  }

  get actions(): BrowserAction {
    if (!this.action) throw new Error('Agent not initialized');
    return this.action;
  }
}
