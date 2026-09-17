import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApplyType, NeedsHumanReason } from '@autoapply/providers-core';

export interface PageClassification {
  loggedIn: boolean;
  applyType: ApplyType;
  alreadyApplied: boolean;
  blocker?: NeedsHumanReason;
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

/**
 * Pure: takes page HTML plus the selector config, returns what the apply worker should do.
 * Keeping this pure is what lets the whole decision tree be tested without a browser.
 */
export function classifyJobPage(html: string): PageClassification {
  if (!html || html.trim().length === 0) {
    return {
      loggedIn: false,
      applyType: 'SKIPPED',
      alreadyApplied: false,
      blocker: 'UNKNOWN_UI',
    };
  }

  // 1. CAPTCHA blocker
  if (matchesSelector(html, selectors.blockers.captcha)) {
    return {
      loggedIn: matchesSelector(html, selectors.loggedInMarker),
      applyType: 'SKIPPED',
      alreadyApplied: false,
      blocker: 'CAPTCHA',
    };
  }

  // 2. Login redirect / logged-out session expired
  if (matchesSelector(html, selectors.loginRedirect)) {
    return {
      loggedIn: false,
      applyType: 'SKIPPED',
      alreadyApplied: false,
      blocker: 'SESSION_EXPIRED',
    };
  }

  const loggedIn = matchesSelector(html, selectors.loggedInMarker);
  const alreadyApplied = matchesSelector(html, selectors.apply.alreadyApplied);
  const hasInternal = matchesSelector(html, selectors.apply.internalButton);
  const hasExternal = matchesSelector(html, selectors.apply.externalButton);

  const isWalkin =
    html.toLowerCase().includes('walk-in') ||
    html.toLowerCase().includes('walkin');

  if (!loggedIn) {
    // If not logged in, not redirect, no buttons: unknown UI
    return {
      loggedIn: false,
      applyType: 'SKIPPED',
      alreadyApplied: false,
      blocker: 'UNKNOWN_UI',
    };
  }

  // Logged-in page
  if (alreadyApplied) {
    return {
      loggedIn: true,
      applyType: hasInternal ? 'INTERNAL' : 'SKIPPED',
      alreadyApplied: true,
    };
  }

  if (hasInternal || matchesSelector(html, selectors.questionnaire.container)) {
    return {
      loggedIn: true,
      applyType: 'INTERNAL',
      alreadyApplied: false,
    };
  }

  if (hasExternal) {
    return {
      loggedIn: true,
      applyType: 'EXTERNAL',
      alreadyApplied: false,
    };
  }

  if (isWalkin) {
    return {
      loggedIn: true,
      applyType: 'SKIPPED',
      alreadyApplied: false,
    };
  }

  return {
    loggedIn: true,
    applyType: 'SKIPPED',
    alreadyApplied: false,
    blocker: 'UNKNOWN_UI',
  };
}

