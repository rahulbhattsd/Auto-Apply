import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app';
import { prisma } from '@autoapply/database';

test('profile endpoints', async (t) => {
  const app = buildApp();

  const testEmail = `profile-${Date.now()}@example.com`;
  const password = 'Password123!';

  // Register and login to get cookie
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: testEmail, password },
  });
  const cookie = registerResponse.headers['set-cookie'] as string;

  await t.test('update profile should succeed with valid data', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: { cookie },
      payload: { name: 'John Doe', phone: '1234567890' },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.name, 'John Doe');
    assert.strictEqual(body.phone, '1234567890');
  });

  await t.test('get profile should return updated data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { cookie },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.name, 'John Doe');
  });

  // Cleanup
  await prisma.candidateProfile.deleteMany({ where: { user: { email: testEmail } } });
  await prisma.user.deleteMany({ where: { email: testEmail } });
});
