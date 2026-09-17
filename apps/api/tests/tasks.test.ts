import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { prisma } from '@autoapply/database';

test('Background Task Queue and State Transitions', async (t) => {
  const app = buildApp();
  await app.ready();

  const testEmail = `task-test-${Date.now()}@example.com`;
  const password = 'Password123!';

  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: testEmail, password },
  });
  const cookie = regRes.headers['set-cookie'] as string;
  let createdTaskId: number;

  await t.test('POST /api/tasks queues a new background task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { cookie },
      payload: {
        type: 'AI_TASK',
        payload: { prompt: 'Summarize quarterly research document', format: 'markdown' },
      },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.type, 'AI_TASK');
    assert.strictEqual(body.status, 'QUEUED');
    assert.strictEqual(body.attempts, 0);
    createdTaskId = body.id;
  });

  await t.test('GET /api/tasks lists tasks with pagination and total', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body.tasks));
    assert.ok(body.total >= 1);
  });

  await t.test('GET /api/tasks/:id retrieves task details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/tasks/${createdTaskId}`,
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.id, createdTaskId);
    assert.strictEqual(body.type, 'AI_TASK');
  });

  await t.test('POST /api/tasks/:id/cancel cancels queued task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${createdTaskId}/cancel`,
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.status, 'CANCELLED');
  });

  await t.test('POST /api/tasks/:id/retry re-queues cancelled or failed task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${createdTaskId}/retry`,
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.status, 'QUEUED');
  });

  // Cleanup
  await prisma.task.deleteMany({ where: { id: createdTaskId } });
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await app.close();
});
