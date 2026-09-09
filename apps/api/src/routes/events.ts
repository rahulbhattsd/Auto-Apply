import { FastifyInstance } from 'fastify';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import Redis from 'ioredis';
import { env } from '@autoapply/config';
import { verifyToken } from '../middleware/auth';

export default async function eventsRoutes(fastify: FastifyInstance) {
  await fastify.register(FastifySSEPlugin);
  fastify.get('/api/events', { preHandler: [verifyToken] }, async (request, reply) => {
    const userId = request.user!.id;
    const channel = `application-events:${userId}`;

    const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    await subscriber.connect();
    await subscriber.subscribe(channel);

    let keepAliveTimeout: NodeJS.Timeout;

    reply.raw.on('close', () => {
      subscriber.disconnect();
      clearTimeout(keepAliveTimeout);
    });

    reply.sse((async function* () {
      let isClosed = false;
      let resolve: (value: unknown) => void;
      let nextPromise = new Promise(r => resolve = r);

      reply.raw.on('close', () => {
        isClosed = true;
        resolve(''); // unblock the loop
      });

      subscriber.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          resolve(message);
          nextPromise = new Promise(r => resolve = r);
        }
      });

      const setKeepAlive = () => {
        clearTimeout(keepAliveTimeout);
        keepAliveTimeout = setTimeout(() => {
          resolve(JSON.stringify({ type: 'KEEPALIVE' }));
          nextPromise = new Promise(r => resolve = r);
          setKeepAlive();
        }, 30000);
      };

      setKeepAlive();
      yield { data: JSON.stringify({ type: 'CONNECTED' }) };

      while (!isClosed) {
        const msg = await nextPromise;
        if (isClosed || !msg) break;
        yield { data: msg as string };
      }
    })());
  });
}
