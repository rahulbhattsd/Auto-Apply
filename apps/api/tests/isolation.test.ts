import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { prisma } from '@autoapply/database';

test('Strict Multi-Tenant User Isolation & Ownership', async (t) => {
  const app = buildApp();
  await app.ready();

  const userAEmail = `user-a-${Date.now()}@example.com`;
  const userBEmail = `user-b-${Date.now()}@example.com`;
  const password = 'Password123!';

  // Register User A
  const resA = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: userAEmail, password },
  });
  const cookieA = resA.headers['set-cookie'] as string;

  // Register User B
  const resB = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: userBEmail, password },
  });
  const cookieB = resB.headers['set-cookie'] as string;

  let memoryAId: number;
  let convAId: number;
  let taskAId: number;

  await t.test('Setup: User A creates resources', async () => {
    // Memory
    const memRes = await app.inject({
      method: 'POST',
      url: '/api/memory',
      headers: { cookie: cookieA },
      payload: {
        type: 'FACT',
        key: 'secret_code',
        content: 'UserA-Confidential-Token-12345',
        importance: 5,
      },
    });
    assert.strictEqual(memRes.statusCode, 201);
    memoryAId = JSON.parse(memRes.payload).id;

    // Conversation
    const convRes = await app.inject({
      method: 'POST',
      url: '/api/chat/conversations',
      headers: { cookie: cookieA },
      payload: { title: "User A's Private Discussion" },
    });
    assert.strictEqual(convRes.statusCode, 201);
    convAId = JSON.parse(convRes.payload).id;

    // Task
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { cookie: cookieA },
      payload: {
        type: 'AI_TASK',
        payload: { instruction: 'Process User A confidential data' },
      },
    });
    assert.strictEqual(taskRes.statusCode, 201);
    taskAId = JSON.parse(taskRes.payload).id;
  });

  await t.test('Isolation: User B cannot list User A memories', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/memory',
      headers: { cookie: cookieB },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    const found = body.memories.some((m: { id: number }) => m.id === memoryAId);
    assert.strictEqual(found, false, 'User B must not see User A memories');
  });

  await t.test('Isolation: User B cannot update User A memory', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/memory/${memoryAId}`,
      headers: { cookie: cookieB },
      payload: { content: 'Hacked by User B' },
    });
    assert.ok(res.statusCode === 404 || res.statusCode === 500);
  });

  await t.test('Isolation: User B cannot delete User A memory', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/memory/${memoryAId}`,
      headers: { cookie: cookieB },
    });
    assert.ok(res.statusCode === 404 || res.statusCode === 500);
  });

  await t.test('Isolation: User B cannot list User A conversations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/chat/conversations',
      headers: { cookie: cookieB },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    const found = body.some((c: { id: number }) => c.id === convAId);
    assert.strictEqual(found, false, 'User B must not see User A conversations in listing');
  });

  await t.test('Isolation: User B cannot get User A conversation details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/chat/conversations/${convAId}`,
      headers: { cookie: cookieB },
    });
    assert.strictEqual(res.statusCode, 403, 'Should deny access with 403 Forbidden');
  });

  await t.test('Isolation: User B cannot send messages to User A conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/chat/conversations/${convAId}/messages`,
      headers: { cookie: cookieB },
      payload: { content: 'Intruder message' },
    });
    assert.strictEqual(res.statusCode, 403, 'Should deny posting to another user conversation');
  });

  await t.test('Isolation: User B cannot list User A background tasks', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { cookie: cookieB },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    const found = body.tasks.some((t: { id: number }) => t.id === taskAId);
    assert.strictEqual(found, false, 'User B must not see User A tasks');
  });

  await t.test('Isolation: User B cannot inspect or cancel User A task', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/tasks/${taskAId}`,
      headers: { cookie: cookieB },
    });
    assert.ok(res.statusCode === 404 || res.statusCode === 500);

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/tasks/${taskAId}/cancel`,
      headers: { cookie: cookieB },
    });
    assert.ok(cancelRes.statusCode === 404 || cancelRes.statusCode === 500);
  });

  // Cleanup
  await prisma.memory.deleteMany({ where: { key: 'secret_code' } });
  await prisma.conversation.deleteMany({ where: { id: convAId } });
  await prisma.task.deleteMany({ where: { id: taskAId } });
  await prisma.user.deleteMany({
    where: { email: { in: [userAEmail, userBEmail] } },
  });
  await app.close();
});
