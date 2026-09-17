import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth.js';

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  timezone: z.string().min(1).max(50).nullable().optional(),
  preferences: z.record(z.unknown()).nullable().optional(),
});

export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  // GET /api/profile
  fastify.get('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      let profile = await prisma.userProfile.findUnique({ where: { userId } });
      if (!profile) {
        // Create default profile if not exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        profile = await prisma.userProfile.create({
          data: {
            userId,
            displayName: user?.email.split('@')[0] || 'User',
            timezone: 'UTC',
          },
        });
      }
      return reply.send(profile);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch profile' } });
    }
  });

  // PUT /api/profile
  fastify.put('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const data = profileUpdateSchema.parse(request.body);

      const profile = await prisma.userProfile.upsert({
        where: { userId },
        update: {
          ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
          ...(data.bio !== undefined ? { bio: data.bio } : {}),
          ...(data.timezone !== undefined ? { timezone: data.timezone || 'UTC' } : {}),
          ...(data.preferences !== undefined
            ? { preferences: (data.preferences === null ? Prisma.DbNull : data.preferences) as Prisma.InputJsonValue }
            : {}),
        },
        create: {
          userId,
          displayName: data.displayName || 'User',
          bio: data.bio || null,
          timezone: data.timezone || 'UTC',
          ...(data.preferences ? { preferences: data.preferences as Prisma.InputJsonValue } : {}),
        },
      });

      return reply.send(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors },
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' } });
    }
  });
}
