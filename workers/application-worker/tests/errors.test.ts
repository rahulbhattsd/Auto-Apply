import test from 'node:test';
import assert from 'node:assert';
import { classifyError, ErrorCategory, ApplicationExecutionError } from '../src/errors/index';

test('Structured Error Classification Matrix', async (t) => {
    await t.test('Missing Submit Locator is Terminal', () => {
        const error = new Error('MISSING_SUBMIT_LOCATOR');
        const classification = classifyError(error);

        assert.strictEqual(classification.category, ErrorCategory.ADAPTER_FAILURE);
        assert.strictEqual(classification.terminal, true);
        assert.strictEqual(classification.needsHuman, false);
        assert.strictEqual(classification.retryable, false);
    });

    await t.test('Unknown Required Field is Terminal (not CAPTCHA)', () => {
        const error = new Error('UNKNOWN_REQUIRED_FIELD');
        const classification = classifyError(error);

        assert.strictEqual(classification.category, ErrorCategory.ADAPTER_FAILURE);
        assert.strictEqual(classification.terminal, true);
        assert.strictEqual(classification.needsHuman, false);
        assert.strictEqual(classification.retryable, false);
    });

    await t.test('Human Verification is NeedsHuman', () => {
        const error = new Error('CAPTCHA_DETECTED');
        const classification = classifyError(error);

        assert.strictEqual(classification.category, ErrorCategory.HUMAN_VERIFICATION_REQUIRED);
        assert.strictEqual(classification.terminal, false);
        assert.strictEqual(classification.needsHuman, true);
    });

    await t.test('Submission Not Confirmed is Retryable', () => {
        const error = new Error('SUBMISSION_NOT_CONFIRMED');
        const classification = classifyError(error);

        assert.strictEqual(classification.category, ErrorCategory.SUBMISSION_FAILURE);
        assert.strictEqual(classification.retryable, true);
        assert.strictEqual(classification.terminal, false);
    });

    await t.test('ApplicationExecutionError passes through attributes', () => {
        const baseClass = classifyError(new Error('timeout'));
        const execError = new ApplicationExecutionError('timeout wrapped', baseClass, { metadata: { step: 1 } });
        const result = classifyError(execError);

        assert.strictEqual(result.category, ErrorCategory.TRANSIENT_NETWORK_ERROR);
        assert.strictEqual(result.retryable, true);
    });
});
