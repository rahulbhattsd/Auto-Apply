import { test, describe, mock, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GenericFallbackAdapter } from '../src/adapters/GenericFallbackAdapter';
import { Page } from 'playwright';
import { connection } from '@autoapply/queue';
import { mock as nodeMock } from 'node:test';

const store = new Map();
connection.get = nodeMock.fn(async (key) => store.get(key) || null) as any;
connection.set = nodeMock.fn(async (key, val) => { store.set(key, val); return 'OK'; }) as any;
connection.incr = nodeMock.fn(async () => 1) as any;
connection.expire = nodeMock.fn(async () => 1) as any;
connection.keys = nodeMock.fn(async () => []) as any;
connection.del = nodeMock.fn(async (...keys) => { keys.forEach(k => store.delete(k)); return 1; }) as any;
connection.quit = nodeMock.fn(async () => 'OK') as any;

import { FieldMappingProvider } from '@autoapply/ai-analysis';

describe('GenericFallbackAdapter', () => {
    let mockPage: any;
    const mockCandidateProfile = {
        name: 'John Doe',
        user: { email: 'john@example.com' },
        phone: '1234567890'
    };

    beforeEach(async () => {
        store.clear();
        mockPage = {
            url: () => 'http://test.com/apply',
            goto: async () => {},
            $$: async () => [],
            $$eval: async () => [],
            $: async () => null,
            fill: mock.fn(),
            selectOption: mock.fn(),
            click: async () => {},
            waitForSelector: async () => ({ textContent: async () => 'Success' })
        };
    });

    after(async () => {
       await connection.quit();
    });

    test('Fills fields successfully based on AI mapping', async () => {
        const adapter = new GenericFallbackAdapter();

        const mockFields = [
           { tagName: 'input', name: 'firstName', id: 'first_name', required: true }
        ];

        adapter.inspect = async () => ({ inputs: mockFields });

        const mockMapFields = mock.fn(async () => ({
           mapping: { '#first_name': 'John Doe' }
        }));
        (adapter as any).fieldMappingProvider = { mapFields: mockMapFields };

        mockPage.$ = async (selector: string) => {
            if (selector === '#first_name') return { evaluate: async () => 'input' };
            return null;
        };

        mockPage.$$eval = async () => [];

        await adapter.fill(mockPage as unknown as Page, mockCandidateProfile, '/dummy/path.pdf');

        assert.strictEqual(mockMapFields.mock.calls.length, 1);
        assert.strictEqual(mockPage.fill.mock.calls.length, 1);
        assert.deepStrictEqual(mockPage.fill.mock.calls[0].arguments, ['#first_name', 'John Doe', { timeout: 2000 }]);
    });

    test('Rejects hallucinated data (values not in profile)', async () => {
        const adapter = new GenericFallbackAdapter();

        const mockFields = [
           { tagName: 'input', name: 'firstNameHallucinate', id: 'first_name_hallucinate', required: true }
        ];
        adapter.inspect = async () => ({ inputs: mockFields });

        const mockMapFields = mock.fn(async () => ({
           mapping: { '#first_name': 'Jane Doe' }
        }));
        (adapter as any).fieldMappingProvider = { mapFields: mockMapFields };

        mockPage.$$eval = async () => [];

        await adapter.fill(mockPage as unknown as Page, mockCandidateProfile, '/dummy/path.pdf');

        assert.strictEqual(mockMapFields.mock.calls.length, 1);
        assert.strictEqual(mockPage.fill.mock.calls.length, 0);
    });

    test('Throws UNKNOWN_REQUIRED_FIELD when required fields remain empty', async () => {
        const adapter = new GenericFallbackAdapter();

        const mockFields = [
           { tagName: 'input', name: 'firstNameEmpty', id: 'first_name_empty', required: true }
        ];
        adapter.inspect = async () => ({ inputs: mockFields });

        const mockMapFields = mock.fn(async () => ({
           mapping: {}
        }));
        (adapter as any).fieldMappingProvider = { mapFields: mockMapFields };

        mockPage.$$eval = async () => ['first_name'];

        await assert.rejects(async () => {
           await adapter.fill(mockPage as unknown as Page, mockCandidateProfile, '/dummy/path.pdf');
        }, /UNKNOWN_REQUIRED_FIELD:first_name/);
    });

    test('Uses Redis cache to prevent redundant AI calls', async () => {
        const adapter = new GenericFallbackAdapter();

        const mockFields = [
           { tagName: 'input', name: 'emailCache', id: 'email_cache', required: true }
        ];

        adapter.inspect = async () => ({ inputs: mockFields });

        const mockMapFields = mock.fn(async () => ({
           mapping: { '#email': 'john@example.com' }
        }));
        (adapter as any).fieldMappingProvider = { mapFields: mockMapFields };

        mockPage.$ = async (selector: string) => {
            if (selector === '#email') return { evaluate: async () => 'input' };
            return null;
        };
        mockPage.$$eval = async () => [];

        await adapter.fill(mockPage as unknown as Page, mockCandidateProfile, '/dummy/path.pdf');
        await adapter.fill(mockPage as unknown as Page, mockCandidateProfile, '/dummy/path.pdf');

        assert.strictEqual(mockMapFields.mock.calls.length, 1);
        assert.strictEqual(mockPage.fill.mock.calls.length, 2);
    });
});
