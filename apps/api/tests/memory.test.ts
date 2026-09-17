import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { prisma } from '@autoapply/database';

test('Memory Vault CRUD and Search Operations', async (t) => {
  const app = buildApp();
  await app.ready();

  const testEmail = `memory-test-${Date.now()}@example.com`;
  const password = 'Password123!';

  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: testEmail, password },
  });
  const cookie = regRes.headers['set-cookie'] as string;
  let createdMemoryId: number;

  await t.test('POST /api/memory creates a new memory record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memory',
      headers: { cookie },
      payload: {
        type: 'PREFERENCE',
        key: 'preferred_language',
        content: 'Prefers TypeScript with strict type-safety enabled',
        importance: 4,
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.key, 'preferred_language');
    assert.strictEqual(body.type, 'PREFERENCE');
    assert.strictEqual(body.importance, 4);
    createdMemoryId = body.id;
  });

  await t.test('GET /api/memory lists stored memories', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/memory',
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body.memories));
    assert.ok(body.memories.length >= 1);
  });

  await t.test('GET /api/memory?q=TypeScript filters by search query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/memory?q=TypeScript',
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.memories.some((m: { id: number }) => m.id === createdMemoryId));
  });

  await t.test('GET /api/memory?type=PREFERENCE filters by category', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/memory?type=PREFERENCE',
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.memories.every((m: { type: string }) => m.type === 'PREFERENCE'));
  });

  await t.test('PATCH /api/memory/:id updates memory content', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/memory/${createdMemoryId}`,
      headers: { cookie },
      payload: {
        content: 'Prefers TypeScript and Rust for high performance',
        importance: 5,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.content, 'Prefers TypeScript and Rust for high performance');
    assert.strictEqual(body.importance, 5);
  });

  await t.test('DELETE /api/memory/:id deletes memory', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/memory/${createdMemoryId}`,
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);

    // Verify deletion
    const verifyRes = await app.inject({
      method: 'GET',
      url: '/api/memory',
      headers: { cookie },
    });
    const body = JSON.parse(verifyRes.payload);
    assert.strictEqual(body.memories.some((m: { id: number }) => m.id === createdMemoryId), false);
  });

  // Cleanup
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await app.close();
});
