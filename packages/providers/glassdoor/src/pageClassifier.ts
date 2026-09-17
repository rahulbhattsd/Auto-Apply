import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApplyType, NeedsHumanReason } from '@autoapply/providers-core';

export interface GlassdoorClassification {
  loggedIn: boolean;
  applyType: ApplyType;
  /** Glassdoor "Easy Apply" is the only internal path; everything else redirects out. */
  easyApply: boolean;
  alreadyApplied: boolean;
  /** Cloudflare / bot interstitial. Far more common here than on Naukri. */
  blocker?: NeedsHumanReason;
  /** Where "Apply on employer site" points, when applyType is EXTERNAL. */
  externalUrl?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const selectors = JSON.parse(readFileSync(join(HERE, 'selectors.json'), 'utf8'));

export function matchesSelector(html: string, selector: string): boolean {
  if (!html || !selector) return false;
  const parts = selector.split(',').map((s) => s.trim());
  return parts.some((part) => {
    if (part.startsWith('#')) {
      const id = part.slice(1);
      return new RegExp(`id\\s*=\\s*["']${id}["']`, 'i').test(html);
    }
    if (part.startsWith('.')) {
      const cls = part.slice(1);
      return new RegExp(`class\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["']`, 'i').test(html);
    }
    const attrMatch = part.match(/^([a-zA-Z0-9_-]*)\[([a-zA-Z0-9_-]+)(\*?=)(['"]?)(.*?)\4\]$/);
    if (attrMatch) {
      const tag = attrMatch[1];
      const attr = attrMatch[2];
      const op = attrMatch[3];
      const val = attrMatch[5];
      if (op === '*=') {
        const pattern = tag
          ? `<${tag}[^>]*\\b${attr}\\s*=\\s*["'][^"']*${val}[^"']*["']`
          : `\\b${attr}\\s*=\\s*["'][^"']*${val}[^"']*["']`;
        return new RegExp(pattern, 'i').test(html);
      }
      const pattern = tag
        ? `<${tag}[^>]*\\b${attr}\\s*=\\s*["']${val}["']`
        : `\\b${attr}\\s*=\\s*["']${val}["']`;
      return new RegExp(pattern, 'i').test(html);
    }
    return html.includes(part);
  });
}

function extractAttr(html: string, selector: string, targetAttr: string): string | null {
  if (!html || !selector) return null;
  const parts = selector.split(',').map((s) => s.trim());
  for (const part of parts) {
    const attrMatch = part.match(/^([a-zA-Z0-9_-]*)\[([a-zA-Z0-9_-]+)(\*?=)(['"]?)(.*?)\4\]$/);
    if (attrMatch) {
      const tag = attrMatch[1] || '[a-zA-Z0-9_-]+';
      const attr = attrMatch[2];
      const val = attrMatch[5];
      const pattern = `<${tag}[^>]*\\b${attr}\\s*=\\s*["']${val}["'][^>]*\\b${targetAttr}\\s*=\\s*["']([^"']+)["']`;
      const m1 = html.match(new RegExp(pattern, 'i'));
      if (m1 && m1[1]) return m1[1];

      const patternReverse = `<${tag}[^>]*\\b${targetAttr}\\s*=\\s*["']([^"']+)["'][^>]*\\b${attr}\\s*=\\s*["']${val}["']`;
      const m2 = html.match(new RegExp(patternReverse, 'i'));
      if (m2 && m2[1]) return m2[1];
    }
  }
  return null;
}

export function classifyJobPage(html: string): GlassdoorClassification {
  if (!html || html.trim().length === 0) {
    return {
      loggedIn: false,
      applyType: 'SKIPPED',
      easyApply: false,
      alreadyApplied: false,
      blocker: 'UNKNOWN_UI',
    };
  }

  // 1. Cloudflare challenge
  if (matchesSelector(html, selectors.cloudflare)) {
    return {
      loggedIn: false,
      applyType: 'SKIPPED',
      easyApply: false,
      alreadyApplied: false,
      blocker: 'CAPTCHA',
    };
  }

  // 2. Login wall
  if (matchesSelector(html, selectors.loginWall)) {
    return {
      loggedIn: false,
      applyType: 'SKIPPED',
      easyApply: false,
      alreadyApplied: false,
      blocker: 'SESSION_EXPIRED',
    };
  }

  // 3. Logged in marker
  const loggedIn = matchesSelector(html, selectors.loggedInMarker);
  if (!loggedIn) {
    return {
      loggedIn: false,
      applyType: 'SKIPPED',
      easyApply: false,
      alreadyApplied: false,
      blocker: 'UNKNOWN_UI',
    };
  }

  // 4. Already applied
  const alreadyApplied = matchesSelector(html, selectors.apply.alreadyApplied);
  if (alreadyApplied) {
    return {
      loggedIn: true,
      applyType: 'SKIPPED',
      easyApply: false,
      alreadyApplied: true,
    };
  }

  // 5. Easy apply
  const easyApply = matchesSelector(html, selectors.apply.easyApplyButton);
  if (easyApply) {
    return {
      loggedIn: true,
      applyType: 'INTERNAL',
      easyApply: true,
      alreadyApplied: false,
    };
  }

  // 6. Employer site
  const employerSite = matchesSelector(html, selectors.apply.employerSiteButton);
  if (employerSite) {
    const externalUrl = extractAttr(html, selectors.apply.employerSiteButton, 'href');
    const res: GlassdoorClassification = {
      loggedIn: true,
      applyType: 'EXTERNAL',
      easyApply: false,
      alreadyApplied: false,
    };
    if (externalUrl) {
      res.externalUrl = externalUrl;
    }
    return res;
  }

  return {
    loggedIn: true,
    applyType: 'SKIPPED',
    easyApply: false,
    alreadyApplied: false,
    blocker: 'UNKNOWN_UI',
  };
}

