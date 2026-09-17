/**
 * Minimal stand-in for playwright's Page / BrowserContext.
 * Only the surface our providers actually touch is implemented.
 * Tests must NEVER launch a real browser or hit the network.
 */
export interface FakePageOptions {
  html: string;
  url: string;
  /** selector -> number of matching nodes. Used by $$ / waitForSelector. */
  matches?: Record<string, number>;
  /** selector -> text content returned by textContent(). */
  text?: Record<string, string>;
  /** Throw when this selector is clicked, to simulate a broken flow. */
  clickThrowsOn?: string;
  /** Sequence of urls returned by url() on successive calls. */
  urlSequence?: string[];
}

export class FakePage {
  public readonly clicked: string[] = [];
  public readonly filled: Array<{ selector: string; value: string }> = [];
  public readonly navigated: string[] = [];
  public closed = false;
  private urlIndex = 0;

  constructor(private readonly opts: FakePageOptions) {}

  async goto(url: string): Promise<void> {
    this.navigated.push(url);
  }

  url(): string {
    const seq = this.opts.urlSequence;
    if (seq && seq.length > 0) {
      const v = seq[Math.min(this.urlIndex, seq.length - 1)];
      this.urlIndex += 1;
      return v as string;
    }
    return this.opts.url;
  }

  async content(): Promise<string> {
    return this.opts.html;
  }

  async $$(selector: string): Promise<unknown[]> {
    const n = this.opts.matches?.[selector] ?? 0;
    return new Array(n).fill({});
  }

  async textContent(selector: string): Promise<string | null> {
    return this.opts.text?.[selector] ?? null;
  }

  async click(selector: string): Promise<void> {
    if (this.opts.clickThrowsOn && selector === this.opts.clickThrowsOn) {
      throw new Error(`element not found: ${selector}`);
    }
    this.clicked.push(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    this.filled.push({ selector, value });
  }

  async screenshot(): Promise<Buffer> {
    return Buffer.from('fake-png');
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export class FakeBrowserContext {
  public readonly pages: FakePage[] = [];
  constructor(private readonly opts: FakePageOptions) {}
  async newPage(): Promise<FakePage> {
    const p = new FakePage(this.opts);
    this.pages.push(p);
    return p;
  }
  async storageState(): Promise<{ cookies: unknown[]; origins: unknown[] }> {
    return { cookies: [{ name: 'nauk_at', value: 'secret' }], origins: [] };
  }
}

export function collectingLogger() {
  const lines: string[] = [];
  return {
    lines,
    info: (m: string) => lines.push(`info:${m}`),
    warn: (m: string) => lines.push(`warn:${m}`),
    error: (m: string) => lines.push(`error:${m}`),
    debug: (m: string) => lines.push(`debug:${m}`),
  };
}

export function fakeCtx(opts: FakePageOptions, overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user_test_1',
    browser: new FakeBrowserContext(opts) as unknown as import('playwright').BrowserContext,
    logger: collectingLogger(),
    budget: {
      userId: 'user_test_1',
      provider: 'naukri',
      windowDate: '2026-09-17',
      appliesUsed: 0,
      searchesUsed: 0,
      maxAppliesPerDay: 20,
      maxSearchesPerHour: 12,
    },
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}
