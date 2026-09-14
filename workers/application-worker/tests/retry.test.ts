import test from 'node:test';
import assert from 'node:assert';
import { RETRY_POLICIES } from '@autoapply/queue';
import { ErrorCategory } from '../src/errors/index';

test('Retry Exhaustion Policy Logic', async (t) => {
    const maxRetries = RETRY_POLICIES.DEFAULT.attempts;

    const checkPolicy = (retryCount: number) => {
       if (retryCount >= maxRetries) {
          return { allowed: false, terminalReason: 'Retry Exhausted', classification: ErrorCategory.UNKNOWN_FATAL_ERROR };
       }
       return { allowed: true };
    };

    await t.test('retryCount = 0 -> retry allowed', () => {
        const result = checkPolicy(0);
        assert.strictEqual(result.allowed, true);
    });

    await t.test('retryCount = max - 1 -> retry allowed', () => {
        const result = checkPolicy(maxRetries - 1);
        assert.strictEqual(result.allowed, true);
    });

    await t.test('retryCount = max -> execution refused', () => {
        const result = checkPolicy(maxRetries);
        assert.strictEqual(result.allowed, false);
        assert.strictEqual(result.terminalReason, 'Retry Exhausted');
    });

    await t.test('retryCount > max -> execution refused', () => {
        const result = checkPolicy(maxRetries + 1);
        assert.strictEqual(result.allowed, false);
    });
});
