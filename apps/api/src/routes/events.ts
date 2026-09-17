import { FastifyInstance } from 'fastify';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import Redis from 'ioredis';
import { env } from '@autoapply/config';
import { verifyToken } from '../middleware/auth.js';

export default async function eventsRoutes(fastify: FastifyInstance) {
  await fastify.register(FastifySSEPlugin);

  fastify.get('/api/events', { preHandler: [verifyToken] }, async (request, reply) => {
    const userId = request.user!.id;
    const channel = `agent-events:${userId}`;

    let subscriber: Redis | undefined;
    let keepAliveTimeout: NodeJS.Timeout;

    try {
      subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      await subscriber.connect();
      await subscriber.subscribe(channel);
    } catch (err) {
      fastify.log.warn(`[SSE] Redis subscriber failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    }

    reply.raw.on('close', () => {
      if (subscriber) subscriber.disconnect();
      clearTimeout(keepAliveTimeout);
    });

    reply.sse((async function* () {
      let isClosed = false;
      let resolve: (value: unknown) => void;
      let nextPromise = new Promise(r => resolve = r);

      reply.raw.on('close', () => {
        isClosed = true;
        resolve('');
      });

      if (subscriber) {
        subscriber.on('message', (ch: string, message: string) => {
          if (ch === channel) {
            resolve(message);
            nextPromise = new Promise(r => resolve = r);
          }
        });
      }

      const setKeepAlive = () => {
        clearTimeout(keepAliveTimeout);
        keepAliveTimeout = setTimeout(() => {
          resolve(JSON.stringify({ type: 'KEEPALIVE' }));
          nextPromise = new Promise(r => resolve = r);
          setKeepAlive();
        }, 30000);
      };

      setKeepAlive();
      yield { data: JSON.stringify({ type: 'CONNECTED', userId }) };

      while (!isClosed) {
        const msg = await nextPromise;
        if (isClosed || !msg) break;
        yield { data: msg as string };
      }
    })());
  });
}
