import { FastifyInstance } from 'fastify';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import Redis from 'ioredis';
import { env } from '@autoapply/config';

export default async function eventsRoutes(fastify: FastifyInstance) {
  await fastify.register(FastifySSEPlugin);
  fastify.get('/api/events', async (_request, reply) => {

    const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    await subscriber.connect();
    await subscriber.subscribe('application-events');

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

      subscriber.on('message', (channel: string, message: string) => {
        if (channel === 'application-events') {
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
