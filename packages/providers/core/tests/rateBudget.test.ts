import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkApplyBudget, windowDateFor, applyDelayMs, DEFAULT_POLICY } from '../src/rateBudget.js';
import type { RateBudget } from '../src/types.js';

const budget = (over: Partial<RateBudget> = {}): RateBudget => ({
  userId: 'u1',
  provider: 'naukri',
  windowDate: '2026-09-17',
  appliesUsed: 0,
  searchesUsed: 0,
  ...over,
});

// 2026-09-17 14:00 IST == 08:30 UTC
const IST_2PM = new Date('2026-09-17T08:30:00Z');
const IST_3AM = new Date('2026-09-16T21:30:00Z');
const IST_11PM = new Date('2026-09-17T17:30:00Z');

describe('windowDateFor', () => {
  test('uses Asia/Kolkata, not UTC', () => {
    // 2026-09-17T19:00Z is already 2026-09-18 in IST
    assert.equal(windowDateFor(new Date('2026-09-17T19:00:00Z')), '2026-09-18');
  });

  test('is stable across the UTC midnight boundary', () => {
    assert.equal(windowDateFor(new Date('2026-09-17T23:59:00Z')), '2026-09-18');
    assert.equal(windowDateFor(new Date('2026-09-18T00:01:00Z')), '2026-09-18');
  });
});

describe('checkApplyBudget', () => {
  test('allows a fresh budget inside the active window', () => {
    assert.deepEqual(checkApplyBudget(budget(), IST_2PM), { allowed: true });
  });

  test('blocks at the daily cap', () => {
    const d = checkApplyBudget(budget({ appliesUsed: DEFAULT_POLICY.maxAppliesPerDay }), IST_2PM);
    assert.equal(d.allowed, false);
    if (!d.allowed) assert.equal(d.reason, 'DAILY_CAP_REACHED');
  });

  test('blocks one past the cap too (no off-by-one)', () => {
    const at = checkApplyBudget(budget({ appliesUsed: 19 }), IST_2PM);
    assert.equal(at.allowed, true, '19 of 20 must still be allowed');
    const over = checkApplyBudget(budget({ appliesUsed: 21 }), IST_2PM);
    assert.equal(over.allowed, false);
  });

  test('blocks outside the active window', () => {
    const early = checkApplyBudget(budget(), IST_3AM);
    assert.equal(early.allowed, false);
    if (!early.allowed) assert.equal(early.reason, 'OUTSIDE_ACTIVE_WINDOW');

    const late = checkApplyBudget(budget(), IST_11PM);
    assert.equal(late.allowed, false);
  });

  test('rejects a stale window row instead of silently reusing yesterday count', () => {
    const d = checkApplyBudget(budget({ windowDate: '2026-09-16' }), IST_2PM);
    assert.equal(d.allowed, false);
    if (!d.allowed) assert.equal(d.reason, 'STALE_WINDOW');
  });

  test('a custom policy overrides the default cap', () => {
    const d = checkApplyBudget(budget({ appliesUsed: 5 }), IST_2PM, {
      ...DEFAULT_POLICY,
      maxAppliesPerDay: 5,
    });
    assert.equal(d.allowed, false);
  });
});

describe('applyDelayMs', () => {
  test('stays within the documented 45s-180s band', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const ms = applyDelayMs(() => r);
      assert.ok(ms >= 45_000, `${ms} below floor`);
      assert.ok(ms <= 180_000, `${ms} above ceiling`);
    }
  });

  test('is not constant — a fixed delay is a detectable signature', () => {
    const seen = new Set(Array.from({ length: 50 }, () => applyDelayMs()));
    assert.ok(seen.size > 10, 'delay must be randomised');
  });
});
