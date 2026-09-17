import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { prisma } from '@autoapply/database';

test('Chat Assistant Conversations, Orchestration and Persistence', async (t) => {
  const app = buildApp();
  await app.ready();

  const testEmail = `chat-test-${Date.now()}@example.com`;
  const password = 'Password123!';

  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: testEmail, password },
  });
  const cookie = regRes.headers['set-cookie'] as string;
  let convId: number;

  await t.test('POST /api/chat/conversations creates a conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/conversations',
      headers: { cookie },
      payload: { title: 'Project Planning' },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.title, 'Project Planning');
    convId = body.id;
  });

  await t.test('GET /api/chat/conversations lists conversations with message count', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/chat/conversations',
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body));
    assert.ok(body.some((c: { id: number }) => c.id === convId));
  });

  await t.test('PATCH /api/chat/conversations/:id renames conversation', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/chat/conversations/${convId}`,
      headers: { cookie },
      payload: { title: 'Architecture Review' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.title, 'Architecture Review');
  });

  await t.test('POST /api/chat/conversations/:id/messages orchestrates response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/chat/conversations/${convId}/messages`,
      headers: { cookie },
      payload: { content: 'Calculate 25 * 4 and tell me today date' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.success, true);
    assert.ok(body.message);
    assert.strictEqual(body.message.role, 'assistant');
    assert.ok(typeof body.message.content === 'string');
    assert.ok(body.message.content.length > 0);
  });

  await t.test('GET /api/chat/conversations/:id returns conversation with message history', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/chat/conversations/${convId}`,
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.id, convId);
    assert.ok(Array.isArray(body.messages));
    assert.ok(body.messages.length >= 2); // user message + assistant message
    assert.strictEqual(body.messages[0].role, 'user');
    assert.strictEqual(body.messages[1].role, 'assistant');
  });

  await t.test('DELETE /api/chat/conversations/:id deletes conversation', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/chat/conversations/${convId}`,
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);

    const checkRes = await app.inject({
      method: 'GET',
      url: `/api/chat/conversations/${convId}`,
      headers: { cookie },
    });
    assert.strictEqual(checkRes.statusCode, 404);
  });

  // Cleanup
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await app.close();
});
