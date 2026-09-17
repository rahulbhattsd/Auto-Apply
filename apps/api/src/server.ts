import { env } from '@autoapply/config';
import { prisma } from '@autoapply/database';
import { connection as redisConnection, setupJobTracker } from '@autoapply/queue';
import { buildApp } from './app.js';

let app: ReturnType<typeof buildApp> | undefined;

const start = async () => {
  try {
    app = buildApp();

    // Readiness endpoint: verifies DB and Redis
    app.get('/api/ready', async (_request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        await redisConnection.ping();
        return reply.send({ status: 'ok', db: 'ok', redis: 'ok' });
      } catch (error) {
        app?.log.error(error, 'Ready check failed');
        return reply.status(503).send({
          success: false,
          error: { code: 'NOT_READY', message: 'Service dependencies not ready' },
        });
      }
    });

    // Initialize job tracker
    try {
      setupJobTracker();
    } catch (trackerErr) {
      app.log.warn(`Job tracker initialization failed (Redis might be connecting): ${trackerErr}`);
    }

    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Personal AI Agent API server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    console.error('Fatal API startup error:', err);
    process.exit(1);
  }
};

start();

const shutdown = async (signal: NodeJS.Signals) => {
  console.log(`Received ${signal}, initiating graceful shutdown...`);
  try {
    if (app) {
      await app.close();
    }
    await redisConnection.quit().catch(() => {});
    await prisma.$disconnect();
    console.log('Clean shutdown complete.');
    process.exit(0);
  } catch (error) {
    console.error(`Failed to shut down cleanly after ${signal}:`, error);
    process.exit(1);
  }
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
