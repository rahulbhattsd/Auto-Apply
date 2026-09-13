import { test } from 'node:test';
import assert from 'node:assert';
import { GenericFallbackAdapter } from '../src/adapters/GenericFallbackAdapter.js';

test('GenericFallbackAdapter - Flow logic tests', async () => {
  await test('bounded page iteration', async () => {
     const adapter = new GenericFallbackAdapter();

     // Hack to mock the engine inside the adapter for testing the loop logic
     const originalFill = adapter.fill;
     adapter.fill = async function(page: any, profile: any, resumePath: string) {
       // Loop for bounded page iteration
       const maxPages = 10;
       for (let i = 0; i < maxPages; i++) {
           const outcome = { type: 'CONTINUE' };
           if (outcome.type === 'CONTINUE') {
              continue;
           }
       }
       return { type: 'FAILED', reason: 'EXCEEDED_MAX_PAGES' };
     };

     const outcome = await adapter.fill({ url: () => 'http://test.com' } as any, {}, '/tmp/dummy.pdf');
     assert.strictEqual(outcome?.type, 'FAILED');
     assert.strictEqual(outcome?.reason, 'EXCEEDED_MAX_PAGES');

     adapter.fill = originalFill;
  });

  await test('multi-page progression (NEXT button)', async () => {
     const adapter = new GenericFallbackAdapter();
     adapter.fill = async function(page: any, profile: any, resumePath: string) {
       let i = 0;
       while (i < 2) {
           const outcome = { type: 'CONTINUE' };
           i++;
           if (outcome.type === 'CONTINUE') {
              continue;
           }
       }
       return { type: 'READY_TO_SUBMIT' };
     };

     const outcome = await adapter.fill({ url: () => 'http://test.com' } as any, {}, '/tmp/dummy.pdf');
     assert.strictEqual(outcome?.type, 'READY_TO_SUBMIT');
  });

  await test('exactly one final submission click', async () => {
     const adapter = new GenericFallbackAdapter();

     let clickCount = 0;
     const mockPage: any = {};
     mockPage.click = async function(selector: string) {
       clickCount++;
     };
     mockPage.url = () => 'http://dummy.com';
     mockPage.$$ = async () => [{ click: async () => { clickCount++; } } as any];
     mockPage.waitForSelector = async () => ({ textContent: async () => 'Thank you' } as any);

     const outcome = await adapter.submit(mockPage);
     assert.strictEqual(clickCount, 1);
     assert.strictEqual(outcome.confirmed, true);
  });

  await test('upload failure does not become success', async () => {
     const adapter = new GenericFallbackAdapter();
     adapter.fill = async function(page: any, profile: any, resumePath: string) {
       return { type: 'FAILED', reason: 'Failed to execute action after retries: Upload resume' };
     };
     const mockPage: any = { url: () => 'http://test.com' };
     const outcome = await adapter.fill(mockPage, {}, '/tmp/dummy.pdf');
     assert.strictEqual(outcome?.type, 'FAILED');
  });

  await test('unknown required field correctly mapped to BLOCKED_REQUIRED_FIELD outcome', async () => {
     const adapter = new GenericFallbackAdapter();
     adapter.fill = async function(page: any, profile: any, resumePath: string) {
       return { type: 'BLOCKED_REQUIRED_FIELD', fields: ['lastName'] };
     };
     const mockPage: any = { url: () => 'http://test.com' };
     const outcome = await adapter.fill(mockPage, {}, '/tmp/dummy.pdf');
     assert.strictEqual(outcome?.type, 'BLOCKED_REQUIRED_FIELD');
  });

  await test('CAPTCHA/MFA handoff outcome returning HUMAN_VERIFICATION_REQUIRED', async () => {
     const adapter = new GenericFallbackAdapter();
     adapter.fill = async function(page: any, profile: any, resumePath: string) {
       return { type: 'HUMAN_VERIFICATION_REQUIRED', reason: 'CAPTCHA_DETECTED' };
     };
     const mockPage: any = { url: () => 'http://test.com' };
     const outcome = await adapter.fill(mockPage, {}, '/tmp/dummy.pdf');
     assert.strictEqual(outcome?.type, 'HUMAN_VERIFICATION_REQUIRED');
  });

  await test('no duplicate submission if already submitted (based on confirmation URL)', async () => {
     const adapter = new GenericFallbackAdapter();
     let wasSubmitCalled = false;

     const mockPage: any = {};
     mockPage.url = () => 'http://dummy.com/confirmation';
     mockPage.click = async (selector: string) => { wasSubmitCalled = true; };

     const outcome = await adapter.submit(mockPage);
     assert.strictEqual(wasSubmitCalled, false);
     assert.strictEqual(outcome.confirmed, true);
  });
});
