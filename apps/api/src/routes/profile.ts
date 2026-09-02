import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth';

const profileSchema = z.object({
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  github: z.string().nullable().optional(),
  portfolio: z.string().nullable().optional(),
  education: z.any().optional(),
  experience: z.any().optional(),
  skills: z.any().optional(),
  projects: z.any().optional(),
  certifications: z.any().optional(),
  preferredRoles: z.array(z.string()).optional().default([]),
  preferredLocations: z.array(z.string()).optional().default([]),
  remotePreference: z.string().nullable().optional(),
  minimumSalary: z.number().nullable().optional(),
  maximumSalary: z.number().nullable().optional(),
  employmentTypes: z.array(z.string()).optional().default([]),
  workAuthorization: z.string().nullable().optional(),
  noticePeriod: z.string().nullable().optional(),
});

export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.get('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
      if (!profile) {
        return reply.status(404).send({ success: false, error: { code: 'ERROR', message: 'Profile not found' } });
      }
      return reply.send(profile);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Internal server error' } });
    }
  });

  fastify.put('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const data = profileSchema.parse(request.body);

      const safeData = {
          ...data,
          name: data.name ?? null,
          phone: data.phone ?? null,
          location: data.location ?? null,
          linkedin: data.linkedin ?? null,
          github: data.github ?? null,
          portfolio: data.portfolio ?? null,
          remotePreference: data.remotePreference ?? null,
          minimumSalary: data.minimumSalary ?? null,
          maximumSalary: data.maximumSalary ?? null,
          workAuthorization: data.workAuthorization ?? null,
          noticePeriod: data.noticePeriod ?? null,
          education: data.education === undefined ? null : data.education,
          experience: data.experience === undefined ? null : data.experience,
          skills: data.skills === undefined ? null : data.skills,
          projects: data.projects === undefined ? null : data.projects,
          certifications: data.certifications === undefined ? null : data.certifications,
      };

      const profile = await prisma.candidateProfile.upsert({
        where: { userId },
        update: safeData,
        create: {
            userId,
            ...safeData,
        },
      });

      return reply.send(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Internal server error' } });
    }
  });
}
