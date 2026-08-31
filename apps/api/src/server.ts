import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from '@autoapply/config';
import { prisma } from '@autoapply/database';
import { connection as redisConnection } from '@autoapply/queue';

const fastify = Fastify({
  logger: env.NODE_ENV === 'development' ? { level: 'debug', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } } } : { level: 'info' },
  disableRequestLogging: true,
});

fastify.addHook('onRequest', (request, _reply, done) => { request.log.info({ reqId: request.id, method: request.method, url: request.url, service: 'api' }, 'received request'); done(); });
fastify.addHook('onResponse', (request, reply, done) => { request.log.info({ reqId: request.id, method: request.method, url: request.url, statusCode: reply.statusCode, responseTime: reply.elapsedTime, service: 'api' }, 'request completed'); done(); });

fastify.register(cors, { origin: env.APP_URL, credentials: true });

fastify.get('/api/health', async (_request, reply) => { return reply.send({ status: 'ok' }); });
fastify.get('/api/ready', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redisConnection.ping();
    return reply.send({ status: 'ok', db: 'ok', redis: 'ok' });
  } catch (error) {
    fastify.log.error(error, 'Ready check failed');
    return reply.status(503).send({ status: 'error', message: 'Service not ready' });
  }
});

const start = async () => {
  try {
    const port = env.API_URL ? parseInt(new URL(env.API_URL).port) || 3000 : 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`API server is running at http://localhost:${port}`);
  } catch (err) { fastify.log.error(err); process.exit(1); }
};
start();
