import test from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app';
import { prisma } from '@autoapply/database';
import FormData from 'form-data';

test('resumes endpoints', async (t) => {
  const app = buildApp();

  const testEmail = `resume-${Date.now()}@example.com`;
  const password = 'Password123!';

  // Register and login to get cookie
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: testEmail, password },
  });
  const cookie = registerResponse.headers['set-cookie'] as string;

  await t.test('upload resume should succeed', async () => {
    const form = new FormData();
    form.append('file', Buffer.from('test resume content'), {
      filename: 'test-resume.txt',
      contentType: 'text/plain',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/resumes',
      headers: {
        cookie,
        ...form.getHeaders()
      },
      payload: form,
    });

    assert.strictEqual(response.statusCode, 201);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.fileName, 'test-resume.txt');
    assert.strictEqual(body.isMaster, true);
  });

  await t.test('get resumes should return list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resumes',
      headers: { cookie },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 1);
  });

  // Cleanup
  await prisma.resume.deleteMany({ where: { user: { email: testEmail } } });
  await prisma.user.deleteMany({ where: { email: testEmail } });
});
