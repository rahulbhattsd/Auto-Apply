import { test, describe, mock } from 'node:test';
import strictAssert from 'node:assert';
import { GreenhouseAdapter } from '../src/adapters/GreenhouseAdapter';
import { LeverAdapter } from '../src/adapters/LeverAdapter';
import { Page } from 'playwright';

describe('Application Adapters Error Handling', () => {
    test('GreenhouseAdapter inspect throws CAPTCHA_DETECTED', async () => {
        const adapter = new GreenhouseAdapter();
        const mockPage = {
            goto: async () => {},
            $$: async (selector: string) => {
                if (selector.includes('recaptcha')) return ['iframe'];
                return [];
            }
        } as unknown as Page;

        await strictAssert.rejects(async () => {
            await adapter.inspect(mockPage, 'http://test.com');
        }, /CAPTCHA_DETECTED/);
    });

    test('GreenhouseAdapter submit throws MISSING_SELECTOR if submit button missing', async () => {
        const adapter = new GreenhouseAdapter();
        const mockPage = {
            url: () => 'http://test.com',
            click: async () => { throw new Error('MISSING_SELECTOR:submit_button'); }
        } as unknown as Page;

        await strictAssert.rejects(async () => {
            await adapter.submit(mockPage);
        }, /MISSING_SELECTOR:submit_button/);
    });

    test('LeverAdapter inspect throws CAPTCHA_DETECTED', async () => {
        const adapter = new LeverAdapter();
        const mockPage = {
            goto: async () => {},
            $: async () => null,
            $$: async (selector: string) => {
                if (selector.includes('recaptcha')) return ['iframe'];
                return [];
            }
        } as unknown as Page;

        await strictAssert.rejects(async () => {
            await adapter.inspect(mockPage, 'http://test.com');
        }, /CAPTCHA_DETECTED/);
    });
});
