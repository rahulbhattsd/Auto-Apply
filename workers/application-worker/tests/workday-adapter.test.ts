import { test, describe, before, after } from 'node:test';
import strictAssert from 'node:assert';
import { WorkdayAdapter } from '../src/adapters/WorkdayAdapter';
import { chromium, Browser, Page } from 'playwright';
import path from 'path';

describe('WorkdayAdapter', () => {
    let browser: Browser;
    let page: Page;

    before(async () => {
        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();
    });

    after(async () => {
        await browser.close();
    });

    test('canHandle identifies workday urls', () => {
        const adapter = new WorkdayAdapter();
        strictAssert.ok(adapter.canHandle('https://company.myworkdayjobs.com/career'));
        strictAssert.ok(adapter.canHandle('https://company.workday.com/career'));
        strictAssert.equal(adapter.canHandle('https://boards.greenhouse.io/company'), false);
    });

    test('inspect throws ACCOUNT_REQUIRED on account gate', async () => {
        const adapter = new WorkdayAdapter();
        const url = `file://${path.resolve(__dirname, 'fixtures/workday-account-gate.html')}`;
        await strictAssert.rejects(async () => {
            await adapter.inspect(page, url);
        }, /ACCOUNT_REQUIRED/);
    });

    test('tenant 1: handles multi-step flow and submission successfully', async () => {
        const adapter = new WorkdayAdapter();
        const url = `file://${path.resolve(__dirname, 'fixtures/workday-tenant1.html')}`;

        const mockProfile = {
            name: 'Jane Doe',
            user: { email: 'jane@example.com' }
        };

        await page.goto(url);
        await adapter.fill(page, mockProfile, 'dummy-path.pdf');

        const submitButton = page.locator('[data-automation-id="bottom-navigation-submit-button"]');
        strictAssert.ok(await submitButton.isVisible());

        // Check if EEO decline was selected
        const declineRadio = page.locator('#gender-decline');
        strictAssert.ok(await declineRadio.isChecked());

        const result = await adapter.submit(page);
        strictAssert.ok(result.confirmed);
    });

    test('tenant 2: handles multi-step flow, EEO selects, and submission', async () => {
        const adapter = new WorkdayAdapter();
        const url = `file://${path.resolve(__dirname, 'fixtures/workday-tenant2.html')}`;

        const mockProfile = {
            name: 'John Smith',
            user: { email: 'john@example.com' }
        };

        await page.goto(url);
        await adapter.fill(page, mockProfile, 'dummy-path.pdf');

        const submitButton = page.locator('[data-automation-id="bottom-navigation-submit-button"]');
        strictAssert.ok(await submitButton.isVisible());

        const result = await adapter.submit(page);
        strictAssert.ok(result.confirmed);
    });

    test('tenant 2: throws UNKNOWN_REQUIRED_FIELD if missing data', async () => {
        const adapter = new WorkdayAdapter();
        const url = `file://${path.resolve(__dirname, 'fixtures/workday-tenant2.html')}`;

        // Missing name
        const mockProfile = {
            user: { email: 'john@example.com' }
        };

        await page.goto(url);

        await strictAssert.rejects(async () => {
            await adapter.fill(page, mockProfile, 'dummy-path.pdf');
        }, /UNKNOWN_REQUIRED_FIELD:legalNameSection_firstName,legalNameSection_lastName/);
    });
});
