import { test, describe } from 'node:test';
import strictAssert from 'node:assert';
import { WorkdayAdapter } from '../src/adapters/WorkdayAdapter.js';
import type { Page } from 'playwright';

describe('WorkdayAdapter', () => {
  test('canHandle identifies workday urls', () => {
    const adapter = new WorkdayAdapter();
    strictAssert.ok(adapter.canHandle('https://company.myworkdayjobs.com/career'));
    strictAssert.ok(adapter.canHandle('https://company.workday.com/career'));
    strictAssert.equal(adapter.canHandle('https://boards.greenhouse.io/company'), false);
  });

  test('inspect throws ACCOUNT_REQUIRED on account gate', async () => {
    const adapter = new WorkdayAdapter();
    const mockPage = {
      goto: async () => {},
      $$: async () => [],
      $: async (sel: string) => {
        if (sel.includes('signInSubmitButton') || sel.includes('Sign In')) {
          return {};
        }
        return null;
      },
      $$eval: async () => [],
    } as unknown as Page;

    await strictAssert.rejects(async () => {
      await adapter.inspect(mockPage, 'http://test.com');
    }, /ACCOUNT_REQUIRED/);
  });

  test('fill throws ACCOUNT_REQUIRED when sign in gate is visible', async () => {
    const adapter = new WorkdayAdapter();
    const mockPage = {
      $: async (sel: string) => {
        if (sel.includes('signInSubmitButton')) return {};
        return null;
      },
    } as unknown as Page;

    await strictAssert.rejects(async () => {
      await adapter.fill(mockPage, { name: 'Test User' }, 'test.pdf');
    }, /ACCOUNT_REQUIRED/);
  });

  test('submit throws MISSING_SELECTOR if submit button not found', async () => {
    const adapter = new WorkdayAdapter();
    const mockPage = {
      url: () => 'https://company.myworkdayjobs.com/career',
      $: async () => null,
    } as unknown as Page;

    await strictAssert.rejects(async () => {
      await adapter.submit(mockPage);
    }, /MISSING_SELECTOR:submit_button/);
  });
});
