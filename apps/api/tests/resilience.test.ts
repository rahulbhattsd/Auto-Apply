import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { reportWorkerHeartbeat, getWorkerHeartbeats } from '@autoapply/queue';

test('System Health, Observability and Worker Heartbeats', async (t) => {
  const app = buildApp();
  await app.ready();

  await t.test('GET /api/health responds with 200 OK', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'personal-ai-agent-api');
  });

  await t.test('Worker heartbeat tracking via Redis', async () => {
    const testWorkerId = `test-worker-${Date.now()}`;
    await reportWorkerHeartbeat({
      workerId: testWorkerId,
      workerType: 'TEST_WORKER',
      status: 'HEALTHY',
    });

    const heartbeats = await getWorkerHeartbeats(60000);
    const found = heartbeats.some((w) => w.workerId === testWorkerId);
    assert.strictEqual(found, true, 'Reported heartbeat must be retrievable from Redis');
  });

  await t.test('GET /api/system/workers returns active workers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/system/workers',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.workers));
  });

  await t.test('GET /api/system/status returns system status and AI provider info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/system/status',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.status, 'ok');
    assert.ok(body.aiProvider);
    assert.ok(typeof body.uptime === 'number');
  });

  await app.close();
});
