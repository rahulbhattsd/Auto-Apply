import type { RateBudget } from './types.js';

export interface BudgetPolicy {
  maxAppliesPerDay: number;
  maxSearchesPerHour: number;
  activeWindow: { startHour: number; endHour: number }; // Asia/Kolkata, 24h
  timeZone: string;
}

export const DEFAULT_POLICY: BudgetPolicy = {
  maxAppliesPerDay: 20,
  maxSearchesPerHour: 12,
  activeWindow: { startHour: 9, endHour: 22 },
  timeZone: 'Asia/Kolkata',
};

export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; reason: 'DAILY_CAP_REACHED' | 'OUTSIDE_ACTIVE_WINDOW' | 'STALE_WINDOW' | 'SEARCH_CAP_REACHED' };

export function checkApplyBudget(
  b: RateBudget,
  now: Date,
  p: BudgetPolicy = DEFAULT_POLICY,
): BudgetDecision {
  const today = windowDateFor(now, p.timeZone);
  if (b.windowDate !== today) {
    return { allowed: false, reason: 'STALE_WINDOW' };
  }

  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: p.timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const hour = parseInt(hourFormatter.format(now), 10);
  if (hour < p.activeWindow.startHour || hour >= p.activeWindow.endHour) {
    return { allowed: false, reason: 'OUTSIDE_ACTIVE_WINDOW' };
  }

  if (b.appliesUsed >= p.maxAppliesPerDay) {
    return { allowed: false, reason: 'DAILY_CAP_REACHED' };
  }

  return { allowed: true };
}

/** YYYY-MM-DD in the policy timezone. Used as the RateBudget window key. */
export function windowDateFor(now: Date, tz: string = DEFAULT_POLICY.timeZone): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Randomised pause between applies, in ms. Must never be constant. */
export function applyDelayMs(rand: () => number = Math.random): number {
  const min = 45_000;
  const max = 180_000;
  return Math.floor(min + rand() * (max - min));
}

