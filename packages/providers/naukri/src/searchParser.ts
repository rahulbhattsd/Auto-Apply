import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawJobRef, CanonicalJob } from '@autoapply/providers-core';
import { classifyJobPage } from './pageClassifier.js';

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

interface RawJobItem {
  jobId?: unknown;
  jdURL?: unknown;
  title?: unknown;
  companyName?: unknown;
}

/** Parse the SPA's search JSON payload into provider-neutral refs. */
export function parseSearchPayload(json: unknown): RawJobRef[] {
  if (!json || typeof json !== 'object') {
    return [];
  }
  const payload = json as { jobDetails?: RawJobItem[] };
  if (!Array.isArray(payload.jobDetails)) {
    return [];
  }

  const refs: RawJobRef[] = [];
  for (const item of payload.jobDetails) {
    if (!item || !item.jobId) {
      continue;
    }
    const id = String(item.jobId);
    let url = typeof item.jdURL === 'string' ? item.jdURL : '';
    if (url && !url.startsWith('http')) {
      url = `https://www.naukri.com${url.startsWith('/') ? '' : '/'}${url}`;
    }
    refs.push({
      id,
      url,
      title: typeof item.title === 'string' ? item.title : undefined,
      company: typeof item.companyName === 'string' ? item.companyName : undefined,
    });
  }
  return refs;
}

/** "0 - 2 years" / "0-2 Yrs" / "Fresher" -> { min, max } */
export function parseExperience(label: string): { min: number | null; max: number | null } {
  if (!label) return { min: null, max: null };
  const trimmed = label.trim();
  if (!trimmed || /not disclosed/i.test(trimmed)) {
    return { min: null, max: null };
  }
  if (/fresher/i.test(trimmed)) {
    return { min: 0, max: 0 };
  }
  const rangeMatch = trimmed.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
    };
  }
  const plusMatch = trimmed.match(/(\d+)\s*\+/);
  if (plusMatch && plusMatch[1]) {
    return {
      min: parseInt(plusMatch[1], 10),
      max: null,
    };
  }
  return { min: null, max: null };
}

/** Parse a job detail page into a CanonicalJob. */
export function parseJobDetail(html: string, url: string): CanonicalJob {
  const classification = classifyJobPage(html);

  const titleRaw = extractText(html, selectors.job.title);
  const title = titleRaw && titleRaw.length > 0 ? titleRaw : 'Job Listing';

  const companyRaw = extractText(html, selectors.job.company);
  const company = companyRaw && companyRaw.length > 0 ? companyRaw : 'Company';

  const locRaw = extractText(html, selectors.job.location);
  const locations = locRaw
    ? locRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const expRaw = extractText(html, selectors.job.experience) ?? '';
  const { min: experienceMin, max: experienceMax } = parseExperience(expRaw);

  const salaryText = extractText(html, selectors.job.salary);
  const jdText = extractText(html, selectors.job.description) ?? undefined;

  // Extract jobId from URL (e.g. 060925900001)
  const idMatch = url.match(/(\d{6,})/);
  const providerJobId = idMatch && idMatch[1] ? idMatch[1] : 'unknown';

  return {
    providerJobId,
    provider: 'naukri',
    title,
    company,
    locations,
    experienceMin,
    experienceMax,
    salaryText,
    jdText,
    applyType: classification.applyType,
    applyUrl: url,
  };
}

