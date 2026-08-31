import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth';

const policySchema = z.object({
  targetRoles: z.array(z.string()).optional().default([]),
  targetTechnologies: z.array(z.string()).optional().default([]),
  preferredCompanies: z.array(z.string()).optional().default([]),
  excludedCompanies: z.array(z.string()).optional().default([]),
  excludedKeywords: z.array(z.string()).optional().default([]),
  minimumMatchScore: z.number().nullable().optional(),
  maxApplicationsPerDay: z.number().nullable().optional(),
});

export default async function policyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.get('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const policy = await prisma.applicationPolicy.findUnique({ where: { userId } });
      if (!policy) {
        return reply.status(404).send({ error: 'Policy not found' });
      }
      return reply.send(policy);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.put('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const data = policySchema.parse(request.body);

      const safeData = {
        ...data,
        minimumMatchScore: data.minimumMatchScore ?? null,
        maxApplicationsPerDay: data.maxApplicationsPerDay ?? null,
      };

      const policy = await prisma.applicationPolicy.upsert({
        where: { userId },
        update: safeData,
        create: {
          userId,
          ...safeData,
        },
      });

      return reply.send(policy);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
