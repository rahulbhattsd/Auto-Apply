import type { Page } from 'playwright';
import type {
  JobProvider,
  ProviderId,
  ProviderCapabilities,
  ProviderCtx,
  SearchQuery,
  RawJobRef,
  CanonicalJob,
  ApplyProfile,
  ApplyOutcome,
  VerifyOutcome,
  Evidence,
} from '@autoapply/providers-core';
import type { ApplicationAdapter } from '@autoapply/shared';
import {
  GreenhouseAdapter,
  LeverAdapter,
  AshbyAdapter,
  WorkableAdapter,
  WorkdayAdapter,
  DarwinboxAdapter,
  GenericFallbackAdapter,
} from './adapters/index.js';

export class AtsGenericProvider implements JobProvider {
  readonly id: ProviderId = 'ats-generic';

  readonly capabilities: ProviderCapabilities = {
    search: false,
    recommendedFeed: false,
    internalApply: false,
    externalHandoff: false,
    verifyApplied: true,
  };

  private readonly adapters: ApplicationAdapter[] = [
    new GreenhouseAdapter(),
    new LeverAdapter(),
    new AshbyAdapter(),
    new WorkableAdapter(),
    new WorkdayAdapter(),
    new DarwinboxAdapter(),
    new GenericFallbackAdapter(),
  ];

  getAdapter(url: string): ApplicationAdapter {
    return this.adapters.find((a) => a.canHandle(url)) || new GenericFallbackAdapter();
  }

  async search(_ctx: ProviderCtx, _q: SearchQuery): Promise<RawJobRef[]> {
    return [];
  }

  async fetchDetail(_ctx: ProviderCtx, ref: RawJobRef): Promise<CanonicalJob> {
    const job: CanonicalJob = {
      providerJobId: ref.id,
      provider: this.id,
      title: ref.title || 'Job Listing',
      company: ref.company || 'Unknown',
      locations: [],
      applyType: 'EXTERNAL',
      applyUrl: ref.url,
      sourceUrl: ref.url,
    };
    if (ref.metadata) {
      job.metadata = ref.metadata;
    }
    return job;
  }

  async apply(ctx: ProviderCtx, job: CanonicalJob, profile: ApplyProfile): Promise<ApplyOutcome> {
    const page = await ctx.browser.newPage();
    const targetUrl = job.applyUrl || job.sourceUrl || '';

    try {
      ctx.logger.info(`[AtsGenericProvider] Navigating to ${targetUrl}`);
      const adapter = this.getAdapter(targetUrl);

      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Inspect for blockers like CAPTCHA/MFA/Account gate
      try {
        await adapter.inspect(page, targetUrl);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const evidence = await this.captureEvidence(page, targetUrl);

        if (message.includes('CAPTCHA_DETECTED')) {
          return { status: 'NEEDS_HUMAN', reason: 'CAPTCHA', evidence };
        }
        if (message.includes('MFA_DETECTED') || message.includes('OTP')) {
          return { status: 'NEEDS_HUMAN', reason: 'OTP_REQUIRED', evidence };
        }
        if (message.includes('ACCOUNT_REQUIRED')) {
          return { status: 'NEEDS_HUMAN', reason: 'SESSION_EXPIRED', evidence };
        }
        return { status: 'FAILED', reason: message, retryable: true };
      }

      // Fill application
      const resumePath = profile.resumePath || '';
      const outcome = await adapter.fill(page, profile, resumePath);

      if (outcome.type === 'SUBMITTED') {
        const evidence = await this.captureEvidence(page, page.url());
        return { status: 'APPLIED', evidence };
      }

      if (outcome.type === 'HUMAN_VERIFICATION_REQUIRED') {
        const evidence = await this.captureEvidence(page, page.url());
        return { status: 'NEEDS_HUMAN', reason: 'CAPTCHA', evidence };
      }

      if (outcome.type === 'BLOCKED_REQUIRED_FIELD') {
        const evidence = await this.captureEvidence(page, page.url());
        return { status: 'NEEDS_HUMAN', reason: 'UNANSWERABLE_QUESTION', evidence };
      }

      if (outcome.type === 'FAILED') {
        return { status: 'FAILED', reason: outcome.reason, retryable: false };
      }

      if (outcome.type === 'READY_TO_SUBMIT') {
        const submission = await adapter.submit(page, outcome.submitLocator);

        if (submission.confirmed) {
          const evidence = await this.captureEvidence(page, page.url());
          return { status: 'APPLIED', evidence };
        }

        const evidence = await this.captureEvidence(page, page.url());
        return {
          status: 'NEEDS_HUMAN',
          reason: 'CONFIRMATION_NOT_FOUND',
          evidence,
        };
      }

      return { status: 'FAILED', reason: 'UNKNOWN_OUTCOME', retryable: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const evidence = await this.captureEvidence(page, targetUrl).catch(() => ({
        url: targetUrl,
        timestamp: new Date().toISOString(),
      }));

      if (message.includes('CAPTCHA')) {
        return { status: 'NEEDS_HUMAN', reason: 'CAPTCHA', evidence };
      }
      if (message.includes('MFA') || message.includes('OTP')) {
        return { status: 'NEEDS_HUMAN', reason: 'OTP_REQUIRED', evidence };
      }
      if (message.includes('UNKNOWN_REQUIRED_FIELD')) {
        return { status: 'NEEDS_HUMAN', reason: 'UNANSWERABLE_QUESTION', evidence };
      }
      if (message.includes('MISSING_SELECTOR')) {
        return { status: 'NEEDS_HUMAN', reason: 'UNKNOWN_UI', evidence };
      }

      return { status: 'FAILED', reason: message, retryable: true };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async verifyApplied(ctx: ProviderCtx, job: CanonicalJob): Promise<VerifyOutcome> {
    const page = await ctx.browser.newPage();
    const targetUrl = job.applyUrl || job.sourceUrl || '';

    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const content = (await page.textContent('body'))?.toLowerCase() || '';

      const isConfirmed =
        content.includes('thank you') ||
        content.includes('application submitted') ||
        content.includes('application received') ||
        content.includes('already applied') ||
        page.url().includes('confirmation') ||
        page.url().includes('thanks') ||
        page.url().includes('success');

      const evidence = await this.captureEvidence(page, page.url());

      if (isConfirmed) {
        return { status: 'VERIFIED', evidence };
      }

      return { status: 'NOT_APPLIED' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'FAILED', reason: message };
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async captureEvidence(page: Page, fallbackUrl: string): Promise<Evidence> {
    const currentUrl = page.url() || fallbackUrl;
    const timestamp = new Date().toISOString();

    let screenshotKey: string | null = null;
    let htmlSnapshotKey: string | null = null;

    try {
      const buffer = await page.screenshot({ fullPage: false }).catch(() => null);
      if (buffer) {
        screenshotKey = `data:image/png;base64,${buffer.toString('base64').substring(0, 100)}...`;
      }
      const html = await page.content().catch(() => null);
      if (html) {
        htmlSnapshotKey = `html-${timestamp}`;
      }
    } catch {
      // Evidence capture is best-effort and must never crash the caller
    }

    return {
      screenshotKey,
      htmlSnapshotKey,
      url: currentUrl,
      timestamp,
    };
  }
}
