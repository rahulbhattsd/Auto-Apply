import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium, Browser, Page } from 'playwright';
import path from 'path';
import { GreenhouseAdapter } from '../src/adapters/GreenhouseAdapter';
import { LeverAdapter } from '../src/adapters/LeverAdapter';

const getFileUrl = (filename: string) => `file://${path.resolve(__dirname, 'fixtures', filename)}`;

describe('Application Adapters', () => {
    let browser: Browser;
    let page: Page;

    before(async () => {
        browser = await chromium.launch();
        page = await browser.newPage();
    });

    after(async () => {
        await browser.close();
    });

    describe('GreenhouseAdapter', () => {
        const adapter = new GreenhouseAdapter();

        it('should handle Greenhouse URLs', () => {
            assert.ok(adapter.canHandle('https://boards.greenhouse.io/company/jobs/123'));
            assert.strictEqual(adapter.canHandle('https://jobs.lever.co/company/123'), false);
        });

        it('should successfully fill and submit normal form', async () => {
            const profile = { name: 'John Doe', user: { email: 'john@example.com' } };
            // Provide a dummy path that playwright can resolve safely for file upload, e.g. this test file
            const dummyResume = path.resolve(__filename);

            await adapter.inspect(page, getFileUrl('greenhouse-normal.html'));
            await adapter.fill(page, profile, dummyResume);

            const success = await adapter.submit(page);
            assert.ok(success, 'Expected form submission to succeed');
        });

        it('should throw CAPTCHA_DETECTED when captcha is present', async () => {
            await assert.rejects(
                adapter.inspect(page, getFileUrl('greenhouse-captcha.html')),
                /CAPTCHA_DETECTED/
            );
        });
    });

    describe('LeverAdapter', () => {
        const adapter = new LeverAdapter();

        it('should handle Lever URLs', () => {
            assert.ok(adapter.canHandle('https://jobs.lever.co/company/123'));
            assert.strictEqual(adapter.canHandle('https://boards.greenhouse.io/company/jobs/123'), false);
        });

        it('should successfully fill and submit normal form', async () => {
            const profile = { name: 'Jane Doe', user: { email: 'jane@example.com' } };
            const dummyResume = path.resolve(__filename);

            await adapter.inspect(page, getFileUrl('lever-normal.html'));
            await adapter.fill(page, profile, dummyResume);

            const success = await adapter.submit(page);
            assert.ok(success, 'Expected form submission to succeed');
        });

        it('should throw CAPTCHA_DETECTED when captcha is present', async () => {
            await assert.rejects(
                adapter.inspect(page, getFileUrl('lever-captcha.html')),
                /CAPTCHA_DETECTED/
            );
        });
    });
});
