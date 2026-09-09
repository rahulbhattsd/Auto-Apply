import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(process.cwd(), '../../.env') });
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';

describe('Real-Time Propagation via SSE', () => {
  let app: FastifyInstance;

  before(async () => {
    app = buildApp();
    await app.ready();
    await app.listen({ port: 3001 });
  });

  after(async () => {
    await app.close();
    const { connection } = await import('@autoapply/queue');
    await connection.disconnect();
  });

  it('should return 401 if no cookie is provided', async () => {
    const res = await fetch('http://localhost:3001/api/events');
    assert.strictEqual(res.status, 401);
  });

  it('should only receive events for the specific user', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const { env } = await import('@autoapply/config');
    const { connection } = await import('@autoapply/queue');

    // User 123
    const token123 = jwt.sign({ userId: 123, email: 'user123@test.com', role: 'USER' }, env.JWT_SECRET);

    const controller = new AbortController();
    const res = await fetch('http://localhost:3001/api/events', {
      headers: { Cookie: `jwt=${token123}` },
      signal: controller.signal
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));

    const reader = res.body?.getReader();
    assert.ok(reader);

    // Initial connection message
    const { value: v1 } = await reader.read();
    assert.ok(new TextDecoder().decode(v1).includes('CONNECTED'));

    // Emit event to OTHER user
    await connection.publish('application-events:999', JSON.stringify({ event: 'test-999' }));
    // Emit event to OUR user
    await connection.publish('application-events:123', JSON.stringify({ event: 'test-123' }));

    const { value: v2 } = await reader.read();
    const msg = new TextDecoder().decode(v2);

    assert.ok(!msg.includes('test-999'));
    assert.ok(msg.includes('test-123'));

    controller.abort();
    await new Promise(r => setTimeout(r, 50));
    await connection.disconnect();
  });
});
