import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { prisma } from '@autoapply/database';

test('Personal AI Agent Dashboard Telemetry', async (t) => {
  const app = buildApp();
  await app.ready();

  const testEmail = `dashboard-test-${Date.now()}@example.com`;
  const password = 'Password123!';

  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: testEmail, password },
  });
  const cookie = regRes.headers['set-cookie'] as string;

  await t.test('GET /api/dashboard returns stats, recent items, and system health', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.success, true);
    assert.ok(body.user);
    assert.ok(body.stats);
    assert.strictEqual(typeof body.stats.totalConversations, 'number');
    assert.strictEqual(typeof body.stats.totalMemories, 'number');
    assert.ok(body.stats.tasks);
    assert.ok(Array.isArray(body.recentConversations));
    assert.ok(Array.isArray(body.recentTasks));
    assert.ok(body.systemHealth);
    assert.strictEqual(body.systemHealth.status, 'ok');
  });

  // Cleanup
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await app.close();
});
