import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';
import { prisma } from '@autoapply/database';

test('User Profile and Persona Settings', async (t) => {
  const app = buildApp();
  await app.ready();

  const testEmail = `profile-test-${Date.now()}@example.com`;
  const password = 'Password123!';

  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: testEmail, password },
  });
  const cookie = regRes.headers['set-cookie'] as string;

  await t.test('GET /api/profile creates and returns default profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.displayName);
    assert.strictEqual(body.timezone, 'UTC');
  });

  await t.test('PUT /api/profile updates user display name, bio, timezone, and preferences', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: { cookie },
      payload: {
        displayName: 'Rahul Bhatt',
        bio: 'Lead Architect & Systems Engineer',
        timezone: 'Asia/Kolkata',
        preferences: {
          outputFormat: 'markdown',
          concise: true,
        },
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.displayName, 'Rahul Bhatt');
    assert.strictEqual(body.bio, 'Lead Architect & Systems Engineer');
    assert.strictEqual(body.timezone, 'Asia/Kolkata');
    assert.strictEqual(body.preferences.concise, true);
  });

  await t.test('GET /api/profile returns updated persona details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { cookie },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.displayName, 'Rahul Bhatt');
    assert.strictEqual(body.timezone, 'Asia/Kolkata');
  });

  // Cleanup
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await app.close();
});
