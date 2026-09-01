import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(process.cwd(), '../../.env.example') });
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';

describe('Dashboard Endpoint', () => {
  let app: FastifyInstance;

  before(async () => {
    app = buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('should return valid JSON metrics for dashboard', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: {
        'x-user-id': '1'
      }
    });

    if (response.statusCode !== 200) {
      console.log('Error payload:', response.payload);
    }

    assert.strictEqual(response.statusCode, 200);
    const data = response.json();
    assert.ok(data.metrics !== undefined);
    assert.strictEqual(typeof data.metrics.jobsDiscoveredToday, 'number');
    assert.ok(data.charts !== undefined);
    assert.ok(Array.isArray(data.charts.statusDistribution));
  });
});
