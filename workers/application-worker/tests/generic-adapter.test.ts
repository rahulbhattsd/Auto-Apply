import { test } from 'node:test';
import assert from 'node:assert';
import { GenericFallbackAdapter } from '../src/adapters/GenericFallbackAdapter.js';
import { FormCompletionEngine } from '@autoapply/ai-analysis';

test('GenericFallbackAdapter - Flow logic tests', async () => {
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

     const outcome = await adapter.submit(mockPage, 'button[type="submit"]');
     assert.strictEqual(clickCount, 1);
     assert.strictEqual(outcome.confirmed, true);
  });

  await test('no duplicate submission if already submitted (based on confirmation URL)', async () => {
     const adapter = new GenericFallbackAdapter();
     let wasSubmitCalled = false;

     const mockPage: any = {};
     mockPage.url = () => 'http://dummy.com/confirmation';
     mockPage.click = async (selector: string) => { wasSubmitCalled = true; };

     const outcome = await adapter.submit(mockPage, 'button[type="submit"]');
     assert.strictEqual(wasSubmitCalled, false);
     assert.strictEqual(outcome.confirmed, true);
  });
});
