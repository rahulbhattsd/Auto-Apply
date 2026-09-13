import { test } from 'node:test';
import assert from 'node:assert';
import { ActionExecutor } from '../../src/intelligence/ActionExecutor.js';

test('ActionExecutor - upload failure does not become success', async () => {
   const mockBrowserAction: any = {};
   let timeoutCalled = false;
   const mockPage: any = {
      locator: () => ({
         first: () => ({
            setInputFiles: async () => {},
            inputValue: async () => { throw new Error('Input value missing'); }
         })
      }),
      waitForTimeout: async () => { timeoutCalled = true; }
   };

   const executor = new ActionExecutor(mockBrowserAction, mockPage);

   try {
       await executor.execute([{ type: 'upload', locator: '#resume', description: 'Upload resume' }], '/tmp/dummy.pdf');
       assert.fail('Should have thrown an error');
   } catch (e: any) {
       assert.strictEqual(e.message, 'Failed to execute action after retries: Upload resume');
   }
});
