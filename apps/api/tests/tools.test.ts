import test from 'node:test';
import assert from 'node:assert';
import {
  defaultToolRegistry,
  calculatorTool,
  datetimeTool,
  textUtilsTool,
  jsonUtilsTool,
  codeHelperTool,
  webResearchTool,
} from '../src/services/tools/index.js';

test('Tool Registry and Built-in Safe Tools', async (t) => {
  await t.test('Registry contains all standard safe tools', () => {
    const tools = defaultToolRegistry.list();
    assert.ok(tools.length >= 6);

    const names = tools.map((t) => t.name);
    assert.ok(names.includes('calculator'));
    assert.ok(names.includes('datetime'));
    assert.ok(names.includes('text_utilities'));
    assert.ok(names.includes('json_utilities'));
    assert.ok(names.includes('code_helper'));
    assert.ok(names.includes('web_research'));
  });

  await t.test('calculator tool evaluates expressions safely', async () => {
    const res1 = await calculatorTool.execute({ expression: '42 * 2 + 16' }, { userId: 1 });
    assert.strictEqual(res1.success, true);
    assert.strictEqual((res1.data as { result: number }).result, 100);

    const res2 = await calculatorTool.execute({ expression: '(1500 * 12) - 4500' }, { userId: 1 });
    assert.strictEqual(res2.success, true);
    assert.strictEqual((res2.data as { result: number }).result, 13500);

    // Rejects unsafe tokens
    const resBad = await calculatorTool.execute({ expression: 'process.exit(1)' }, { userId: 1 });
    assert.strictEqual(resBad.success, false);
    assert.ok(resBad.error?.includes('invalid characters'));
  });

  await t.test('datetime tool provides current ISO and timezone dates', async () => {
    const res = await datetimeTool.execute({ timezone: 'Asia/Kolkata' }, { userId: 1 });
    assert.strictEqual(res.success, true);
    const data = res.data as { iso: string; timezone: string; formatted: string };
    assert.ok(data.iso);
    assert.strictEqual(data.timezone, 'Asia/Kolkata');
    assert.ok(data.formatted);
  });

  await t.test('text_utilities tool performs string transformations and statistics', async () => {
    const statsRes = await textUtilsTool.execute({ text: 'personal ai agent architecture', action: 'stats' }, { userId: 1 });
    assert.strictEqual(statsRes.success, true);
    assert.strictEqual((statsRes.data as { wordCount: number }).wordCount, 4);

    const slugRes = await textUtilsTool.execute({ text: 'Hello World 2026', action: 'slugify' }, { userId: 1 });
    assert.strictEqual(slugRes.success, true);
    assert.strictEqual((slugRes.data as { slug: string }).slug, 'hello-world-2026');

    const kwRes = await textUtilsTool.execute({ text: 'agent system worker queue worker agent', action: 'extract_keywords' }, { userId: 1 });
    assert.strictEqual(kwRes.success, true);
    assert.ok(Array.isArray((kwRes.data as { topKeywords: Array<{ keyword: string; count: number }> }).topKeywords));
  });

  await t.test('json_utilities tool parses and validates JSON safely', async () => {
    const validateRes = await jsonUtilsTool.execute({ jsonString: '{"name":"agent","active":true}', action: 'validate' }, { userId: 1 });
    assert.strictEqual(validateRes.success, true);
    assert.strictEqual((validateRes.data as { valid: boolean }).valid, true);

    const formatRes = await jsonUtilsTool.execute({ jsonString: '{"a":1}', action: 'format' }, { userId: 1 });
    assert.strictEqual(formatRes.success, true);
    assert.ok((formatRes.data as { formatted: string }).formatted.includes('\n'));

    const badRes = await jsonUtilsTool.execute({ jsonString: '{broken', action: 'validate' }, { userId: 1 });
    assert.strictEqual(badRes.success, false);
    assert.ok(badRes.error?.includes('JSON parse error'));
  });

  await t.test('code_helper tool validates and formats scripts', async () => {
    const res = await codeHelperTool.execute({ code: 'const x = 10;\nconsole.log(x);', language: 'typescript' }, { userId: 1 });
    assert.strictEqual(res.success, true);
    assert.strictEqual((res.data as { language: string }).language, 'typescript');
  });

  await t.test('web_research tool synthesizes query into key concepts and sources', async () => {
    const res = await webResearchTool.execute({ topic: 'distributed event queues with redis bullmq' }, { userId: 1 });
    assert.strictEqual(res.success, true);
    const data = res.data as { summary: string; sources: Array<{ title: string; url: string }> };
    assert.ok(data.summary);
    assert.ok(Array.isArray(data.sources));
    assert.ok(data.sources.length >= 1);
  });

  await t.test('tool registry execute method returns error on invalid input schema', async () => {
    const res = await defaultToolRegistry.execute('calculator', { invalidProp: 123 }, { userId: 1 });
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('Invalid input'));
  });
});
