import { env } from '@autoapply/config';
import { prisma } from '@autoapply/database';
import { connection as redisConnection } from '@autoapply/queue';
import automationRoutes from "./automation.js";
import { startScheduler } from "./scheduler.js";
import { buildApp } from "./app.js";

const start = async () => {
  const app = buildApp();
  await app.register(automationRoutes);

  app.get('/api/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });
  app.get('/api/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redisConnection.ping();
      return reply.send({ status: 'ok', db: 'ok', redis: 'ok' });
    } catch (error) {
      app.log.error(error, 'Ready check failed');
      return reply.status(503).send({ success: false, error: { code: 'ERROR', message: 'Service not ready' } });
    }
  });

  startScheduler();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`API server is running at http://${env.HOST}:${env.PORT}`);
  } catch (err) { app.log.error(err); process.exit(1); }
};
start();

const shutdown = async (signal: NodeJS.Signals) => {
  try {
    await redisConnection.quit();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error(`Failed to shut down cleanly after ${signal}`, error);
    process.exit(1);
  }
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
