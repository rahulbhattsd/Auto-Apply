import test from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { MockAIProvider } from '../src/MockAIProvider.js';
import { getAIProvider } from '../src/factory.js';

test('AI Provider Abstraction and Mock AI Provider', async (t) => {
  const provider = new MockAIProvider();

  await t.test('generateResponse returns conversational completion', async () => {
    const res = await provider.generateResponse([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the speed of light?' },
    ]);

    assert.ok(typeof res === 'string');
    assert.ok(res.length > 0);
  });

  await t.test('streamResponse invokes onChunk callback', async () => {
    const chunks: string[] = [];
    const res = await provider.streamResponse(
      [
        { role: 'system', content: 'You are an agent.' },
        { role: 'user', content: 'Tell me a story' },
      ],
      undefined,
      (chunk) => chunks.push(chunk)
    );

    assert.ok(typeof res === 'string');
    assert.ok(chunks.length > 0);
    assert.ok(chunks.join('').length > 0);
  });

  await t.test('generateStructuredOutput returns structured intent and summary', async () => {
    const schema = z.object({
      intent: z.string(),
      needsTool: z.boolean(),
      summary: z.string(),
    });

    const structured = await provider.generateStructuredOutput(
      [{ role: 'user', content: 'Score this project: 95' }],
      schema
    );

    assert.strictEqual(typeof structured.intent, 'string');
    assert.strictEqual(typeof structured.needsTool, 'boolean');
    assert.strictEqual(typeof structured.summary, 'string');
  });

  await t.test('factory returns MockAIProvider when AI_PROVIDER is mock', () => {
    const factoryProvider = getAIProvider('mock');
    assert.ok(factoryProvider instanceof MockAIProvider);
    assert.strictEqual(factoryProvider.name, 'mock');
  });
});
