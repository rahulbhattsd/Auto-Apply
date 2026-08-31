import { buildApp } from './apps/api/src/app';

async function run() {
  try {
    const app = buildApp();

    // Add an explicit error listener on the fastify instance
    app.addHook('onError', async (request, reply, error) => {
        console.error('FASTIFY ERROR:', error);
    });

    const testEmail = `test-run-${Date.now()}@example.com`;
    const password = 'Password123!';

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: testEmail, password },
    });

    console.log('STATUS:', response.statusCode);
    console.log('BODY:', response.payload);
  } catch (e) {
    console.error('CATCH BLOCK:', e);
  }
}
run();
