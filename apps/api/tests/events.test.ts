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
  });

  it('should receive SSE events on state transition', async () => {
    const controller = new AbortController();

    const res = await fetch('http://localhost:3001/api/events', { signal: controller.signal });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');

    const reader = res.body?.getReader();
    assert.ok(reader);

    // Read connected event
    const { value: connectedValue } = await reader.read();
    const connectedStr = new TextDecoder().decode(connectedValue);
    assert.ok(connectedStr.includes('data: {"type":"CONNECTED"}'));

    controller.abort();
    await new Promise(r => setTimeout(r, 100));
  });
});
