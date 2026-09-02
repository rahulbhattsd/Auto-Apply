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
    const workerHealth = await import("@autoapply/queue").then(q => q.checkWorkerHealth());
    if (!workerHealth) return reply.status(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'workers down' } });
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
    const port = env.API_URL ? parseInt(new URL(env.API_URL).port) || 3000 : 3000;
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`API server is running at http://localhost:${port}`);
  } catch (err) { app.log.error(err); process.exit(1); }
};
start();
