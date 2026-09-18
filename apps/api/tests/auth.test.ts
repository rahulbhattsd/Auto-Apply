import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { prisma } from '@autoapply/database';
import { allowedEmails } from '@autoapply/config';

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

  await t.test('POST /api/auth/logout should clear cookie and revoke token server-side', async () => {
    // First login to get a fresh cookie
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testEmail, password },
    });
    const freshCookie = loginResponse.headers['set-cookie'] as string;
    assert.ok(freshCookie);

    // Logout
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: freshCookie },
    });
    assert.strictEqual(logoutResponse.statusCode, 200);

    // Verify the token is revoked — /me should fail even with the old cookie
    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: freshCookie },
    });
    assert.strictEqual(meResponse.statusCode, 401, 'Token should be revoked after logout');
  });

  await t.test('Email allowlist enforcement on register and login', async () => {
    // Configure allowlist dynamically for this test
    allowedEmails.length = 0;
    allowedEmails.push('rahulbhatt.tech@gmail.com', 'rb4724203@gmail.com');

    const unauthorizedEmail = `intruder-${Date.now()}@example.com`;
    const allowedEmail = 'rahulbhatt.tech@gmail.com';

    // 1. Unauthorized signup attempt should be rejected with 403
    const blockedRegisterRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: unauthorizedEmail, password: 'StrongPassword123!' },
    });
    assert.strictEqual(blockedRegisterRes.statusCode, 403);
    const blockedRegisterBody = JSON.parse(blockedRegisterRes.payload);
    assert.strictEqual(blockedRegisterBody.error.code, 'ACCESS_DENIED');
    assert.strictEqual(blockedRegisterBody.error.message, 'This app is invite-only. Contact the owner for access.');

    // 2. Allowlisted email signup should succeed with 201
    // Ensure clean state first
    await prisma.user.deleteMany({ where: { email: allowedEmail } });
    const allowedRegisterRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: allowedEmail, password: 'StrongPassword123!', name: 'Rahul Bhatt' },
    });
    assert.strictEqual(allowedRegisterRes.statusCode, 201);

    // 3. Allowlisted email login should succeed with 200
    const allowedLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: allowedEmail, password: 'StrongPassword123!' },
    });
    assert.strictEqual(allowedLoginRes.statusCode, 200);

    // 4. Unauthorized email login attempt (even if user exists in DB) should be rejected with 403
    // Create an unallowlisted user directly in DB (e.g. legacy user)
    const legacyEmail = `legacy-${Date.now()}@example.com`;
    await prisma.user.create({
      data: {
        email: legacyEmail,
        hashedPassword: 'dummy-hashed-password',
      },
    });

    const blockedLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: legacyEmail, password: 'AnyPassword123!' },
    });
    assert.strictEqual(blockedLoginRes.statusCode, 403);
    const blockedLoginBody = JSON.parse(blockedLoginRes.payload);
    assert.strictEqual(blockedLoginBody.error.code, 'ACCESS_DENIED');
    assert.strictEqual(blockedLoginBody.error.message, 'This app is invite-only. Contact the owner for access.');

    // Cleanup test users
    await prisma.user.deleteMany({ where: { email: { in: [allowedEmail, legacyEmail] } } });
    allowedEmails.length = 0; // restore
  });

  // Cleanup
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await app.close();
});
