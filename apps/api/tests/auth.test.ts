import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { prisma } from '@autoapply/database';

test('Authentication and Session Endpoints', async (t) => {
  const app = buildApp();
  await app.ready();

  const testEmail = `test-auth-${Date.now()}@example.com`;
  const password = 'SecurePassword123!';
  let authCookie = '';

  await t.test('POST /api/auth/register should create user and set httpOnly cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: testEmail, password },
    });

    assert.strictEqual(response.statusCode, 201);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.email, testEmail);
    assert.ok(response.headers['set-cookie']);
    authCookie = response.headers['set-cookie'] as string;
  });

  await t.test('POST /api/auth/register with duplicate email should return 409 Conflict', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: testEmail, password },
    });

    assert.strictEqual(response.statusCode, 409);
  });

  await t.test('POST /api/auth/login with valid credentials should succeed', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testEmail, password },
    });

    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.headers['set-cookie']);
  });

  await t.test('POST /api/auth/login with wrong password should fail with 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testEmail, password: 'WrongPassword999!' },
    });

    assert.strictEqual(response.statusCode, 401);
  });

  await t.test('GET /api/auth/me with cookie should return current user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.email, testEmail);
  });

  await t.test('GET /api/auth/me without cookie should return 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    assert.strictEqual(response.statusCode, 401);
  });

  await t.test('POST /api/auth/logout should clear cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: authCookie },
    });

    assert.strictEqual(response.statusCode, 200);
  });

  // Cleanup
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await app.close();
});
