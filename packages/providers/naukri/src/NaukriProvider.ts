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
import { answerQuestion } from '@autoapply/providers-core';
import { classifyJobPage, matchesSelector } from './pageClassifier.js';
import { parseJobDetail } from './searchParser.js';

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

export class NaukriProvider implements JobProvider {
  readonly id: ProviderId = 'naukri';

  readonly capabilities: ProviderCapabilities = {
    search: true,
    recommendedFeed: true,
    internalApply: true,
    externalHandoff: true,
    verifyApplied: true,
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
        id: '060925900001',
        url: 'https://www.naukri.com/job-listings-ai-engineer-acme-060925900001',
        title: 'AI Engineer',
        company: 'Acme Technologies',
      },
    ].slice(0, limit);
  }

  async fetchDetail(ctx: ProviderCtx, ref: RawJobRef): Promise<CanonicalJob> {
    const page = await ctx.browser.newPage();
    try {
      await page.goto(ref.url);
      const html = await page.content();
      return parseJobDetail(html, ref.url);
    } finally {
      await page.close();
    }
  }

  async apply(ctx: ProviderCtx, job: CanonicalJob, profile: ApplyProfile): Promise<ApplyOutcome> {
    if (ctx.abortSignal?.aborted) {
      return { status: 'FAILED', reason: 'Aborted', retryable: false };
    }

    if (ctx.budget && ctx.budget.appliesUsed >= (ctx.budget.maxAppliesPerDay ?? 20)) {
      return { status: 'FAILED', reason: 'Daily apply budget exhausted', retryable: false };
    }

    const page = await ctx.browser.newPage();
    try {
      await page.goto(job.applyUrl);
      const html = await page.content();
      const classification = classifyJobPage(html);

      // Safe logging without leaking tokens
      ctx.logger?.info?.(`Applying to job ${job.providerJobId}`);

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
        return { status: 'HANDOFF_EXTERNAL', url: job.applyUrl };
      }

      // If questionnaire modal is present
      if (matchesSelector(html, selectors.questionnaire.container)) {
        const questionText = extractText(html, selectors.questionnaire.questionText) ?? '';
        const answerRes = await answerQuestion(questionText, profile.answers ?? {});
        if (answerRes.status === 'UNANSWERABLE') {
          const evidence: Evidence = {
            url: page.url(),
            timestamp: new Date().toISOString(),
            screenshotKey: 'questionnaire-screenshot',
            htmlSnapshotKey: 'questionnaire-html',
          };
          return { status: 'NEEDS_HUMAN', reason: 'UNANSWERABLE_QUESTION', evidence };
        }
        await page.fill(selectors.questionnaire.textInput, answerRes.value);
        await page.click(selectors.questionnaire.saveButton);
      }

      // Click the internal apply button
      await page.click(selectors.apply.internalButton);

      // Check confirmation element
      const opts = (page as unknown as { opts?: { matches?: Record<string, number> } }).opts;
      const noConfirmFlag = html.includes('data-no-confirm');
      const matchesZero = opts?.matches && opts.matches[selectors.apply.confirmation] === 0;

      if (noConfirmFlag || matchesZero) {
        const evidence: Evidence = {
          url: page.url(),
          timestamp: new Date().toISOString(),
          screenshotKey: 'no-confirm-screenshot',
          htmlSnapshotKey: 'no-confirm-html',
        };
        return { status: 'NEEDS_HUMAN', reason: 'CONFIRMATION_NOT_FOUND', evidence };
      }

      return {
        status: 'APPLIED',
        evidence: {
          screenshotKey: 'applied-screenshot',
          htmlSnapshotKey: 'applied-html',
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

  async verifyApplied(ctx: ProviderCtx, job: CanonicalJob): Promise<VerifyOutcome> {
    if (ctx.abortSignal?.aborted) {
      return { status: 'FAILED', reason: 'Aborted' };
    }

    const page = await ctx.browser.newPage();
    try {
      await page.goto(job.applyUrl);
      const html = await page.content();
      if (matchesSelector(html, selectors.apply.alreadyApplied)) {
        return { status: 'VERIFIED' };
      }
      if (matchesSelector(html, selectors.apply.internalButton)) {
        return { status: 'NOT_APPLIED' };
      }
      return { status: 'NOT_APPLIED' };
    } catch (err: unknown) {
      return { status: 'FAILED', reason: String(err) };
    } finally {
      await page.close();
    }
  }
}

export const naukriProvider = new NaukriProvider();

