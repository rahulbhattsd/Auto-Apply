import { test } from 'node:test';
import assert from 'node:assert';
import { ApplicationOutcome } from '../src/ApplicationOutcome.js';

test('ApplicationOutcome types', () => {
   const outcome1: ApplicationOutcome = { type: 'CONTINUE' };
   assert.strictEqual(outcome1.type, 'CONTINUE');

   const outcome2: ApplicationOutcome = { type: 'READY_TO_SUBMIT', submitLocator: '#submit' };
   assert.strictEqual(outcome2.type, 'READY_TO_SUBMIT');
   assert.strictEqual(outcome2.submitLocator, '#submit');

   const outcome3: ApplicationOutcome = { type: 'BLOCKED_REQUIRED_FIELD', fields: ['name'] };
   assert.strictEqual(outcome3.type, 'BLOCKED_REQUIRED_FIELD');
   assert.deepStrictEqual(outcome3.fields, ['name']);
});
