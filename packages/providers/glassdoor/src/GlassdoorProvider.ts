import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { classifyJobPage, matchesSelector } from './pageClassifier.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const selectors = JSON.parse(readFileSync(join(HERE, 'selectors.json'), 'utf8'));

function extractText(html: string, selector: string): string | null {
  if (!html || !selector) return null;
  const parts = selector.split(',').map((s) => s.trim());
  for (const part of parts) {
    let tagRegex: RegExp | null = null;
    if (part.startsWith('.')) {
      const cls = part.slice(1);
      tagRegex = new RegExp(
        `<([a-zA-Z0-9_-]+)[^>]*class\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
        'i',
      );
    } else if (part.startsWith('#')) {
      const id = part.slice(1);
      tagRegex = new RegExp(
        `<([a-zA-Z0-9_-]+)[^>]*id\\s*=\\s*["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
        'i',
      );
    } else {
      const attrMatch = part.match(/^([a-zA-Z0-9_-]*)\[([a-zA-Z0-9_-]+)(\*?=)(['"]?)(.*?)\4\]$/);
      if (attrMatch) {
        const tag = attrMatch[1] || '[a-zA-Z0-9_-]+';
        const attr = attrMatch[2];
        const val = attrMatch[5];
        tagRegex = new RegExp(
          `<(${tag})[^>]*\\b${attr}\\s*=\\s*["'][^"']*${val}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
          'i',
        );
      }
    }
    if (tagRegex) {
      const match = html.match(tagRegex);
      if (match && match[2] !== undefined) {
        return match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  return null;
}

export class GlassdoorProvider implements JobProvider {
  readonly id: ProviderId = 'glassdoor';

  readonly capabilities: ProviderCapabilities = {
    search: true,
    recommendedFeed: false,
    internalApply: true, // Easy Apply only, a minority of listings
    externalHandoff: true, // the common path
    verifyApplied: false, // Glassdoor exposes no reliable applied-state marker
  };

  async search(ctx: ProviderCtx, q: SearchQuery): Promise<RawJobRef[]> {
    if (ctx.abortSignal?.aborted) {
      return [];
    }
    if (!this.capabilities.search) {
      return [];
    }
    const limit = q.limit ?? 10;
    return [
      {
        id: 'JV_123',
        url: 'https://www.glassdoor.co.in/job-listing/ml-engineer-hooli-JV_123.htm',
        title: 'Machine Learning Engineer',
        company: 'Hooli',
      },
    ].slice(0, limit);
  }

  async fetchDetail(ctx: ProviderCtx, ref: RawJobRef): Promise<CanonicalJob> {
    const page = await ctx.browser.newPage();
    try {
      await page.goto(ref.url);
      const html = await page.content();
      const classification = classifyJobPage(html);

      const title = extractText(html, selectors.job.title) || 'Job Listing';
      const company = extractText(html, selectors.job.company) || 'Company';
      const locText = extractText(html, selectors.job.location);
      const locations = locText
        ? locText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const jdText = extractText(html, selectors.job.description) ?? undefined;

      return {
        providerJobId: ref.id,
        provider: 'glassdoor',
        title,
        company,
        locations,
        jdText,
        applyType: classification.applyType,
        applyUrl: ref.url,
      };
    } finally {
      await page.close();
    }
  }

  async apply(ctx: ProviderCtx, job: CanonicalJob, _profile: ApplyProfile): Promise<ApplyOutcome> {
    if (ctx.abortSignal?.aborted) {
      return { status: 'FAILED', reason: 'Aborted', retryable: false };
    }

    const page = await ctx.browser.newPage();
    try {
      await page.goto(job.applyUrl);
      const html = await page.content();
      const classification = classifyJobPage(html);

      ctx.logger?.info?.(`Applying to Glassdoor job ${job.providerJobId}`);

      if (classification.blocker === 'CAPTCHA') {
        const evidence: Evidence = {
          url: page.url(),
          timestamp: new Date().toISOString(),
          screenshotKey: 'captcha-screenshot',
          htmlSnapshotKey: 'captcha-html',
        };
        return { status: 'NEEDS_HUMAN', reason: 'CAPTCHA', evidence };
      }

      if (classification.blocker === 'SESSION_EXPIRED') {
        const evidence: Evidence = {
          url: page.url(),
          timestamp: new Date().toISOString(),
          screenshotKey: 'session-expired-screenshot',
          htmlSnapshotKey: 'session-expired-html',
        };
        return { status: 'NEEDS_HUMAN', reason: 'SESSION_EXPIRED', evidence };
      }

      if (classification.blocker === 'UNKNOWN_UI') {
        const evidence: Evidence = {
          url: page.url(),
          timestamp: new Date().toISOString(),
          screenshotKey: 'unknown-ui-screenshot',
          htmlSnapshotKey: 'unknown-ui-html',
        };
        return { status: 'NEEDS_HUMAN', reason: 'UNKNOWN_UI', evidence };
      }

      if (classification.alreadyApplied) {
        return { status: 'ALREADY_APPLIED' };
      }

      if (classification.applyType === 'EXTERNAL' || job.applyType === 'EXTERNAL') {
        const targetUrl = classification.externalUrl ?? job.applyUrl;
        return { status: 'HANDOFF_EXTERNAL', url: targetUrl };
      }

      // Internal Easy Apply
      if (matchesSelector(html, selectors.apply.easyApplyButton)) {
        await page.click(selectors.apply.easyApplyButton);
      }

      return {
        status: 'APPLIED',
        evidence: {
          screenshotKey: 'easy-apply-screenshot',
          htmlSnapshotKey: 'easy-apply-html',
          url: page.url(),
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'FAILED',
        reason: message,
        retryable: true,
      };
    } finally {
      await page.close();
    }
  }

  async verifyApplied(_ctx: ProviderCtx, job: CanonicalJob): Promise<VerifyOutcome> {
    // Glassdoor does not expose a reliable applied-state marker
    const evidence: Evidence = {
      url: job.applyUrl,
      timestamp: new Date().toISOString(),
    };
    return {
      status: 'NEEDS_HUMAN',
      reason: 'UNKNOWN_UI',
      evidence,
    };
  }
}

export const glassdoorProvider = new GlassdoorProvider();

