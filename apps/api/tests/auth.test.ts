import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app';
import { prisma } from '@autoapply/database';

test('auth endpoints', async (t) => {
  const app = buildApp();

  const testEmail = `test-${Date.now()}@example.com`;
  const password = 'Password123!';

  await t.test('register should create a user and return cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: testEmail, password },
    });

    assert.strictEqual(response.statusCode, 201);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.email, testEmail);
    assert.ok(response.headers['set-cookie']);
  });

  await t.test('login should return cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testEmail, password },
    });

    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.headers['set-cookie']);
  });

  await t.test('unauthenticated request should return 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/profile',
    });

    assert.strictEqual(response.statusCode, 401);
  });

  // Cleanup
  await prisma.user.deleteMany({ where: { email: testEmail } });
});
