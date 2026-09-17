import { FastifyInstance } from 'fastify';
import { getWorkerHeartbeats } from '@autoapply/queue';
import { defaultToolRegistry } from '../services/tools/index.js';
import { verifyToken } from '../middleware/auth.js';

export default async function systemRoutes(fastify: FastifyInstance) {
  // GET /api/system/workers - real-time worker heartbeats and health
  fastify.get('/workers', async (_request, reply) => {
    try {
      const workers = await getWorkerHeartbeats(45000);
      return reply.send({
        success: true,
        count: workers.length,
        workers,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve worker heartbeats' },
      });
    }
  });

  // GET /api/system/tools - list of registered AI agent tools
  fastify.get('/tools', { preHandler: [verifyToken] }, async (_request, reply) => {
    try {
      const tools = defaultToolRegistry.list().map(t => ({
        name: t.name,
        description: t.description,
      }));
      return reply.send({ success: true, count: tools.length, tools });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve tools list' },
      });
    }
  });
}
