import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, ApplicationStatus } from '@autoapply/database';
import { verifyToken } from '../middleware/auth.js';
import { TaskService } from '../services/task.js';

const CreateApplicationSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  providerId: z.string().optional().default('ats-generic'),
});

const taskService = new TaskService();

export default async function applicationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  // Helper to ensure candidate profile exists for user
  const ensureCandidate = async (userId: number) => {
    let candidate = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (!candidate) {
      const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
      candidate = await prisma.candidateProfile.create({
        data: {
          userId,
          name: user?.profile?.displayName || user?.email.split('@')[0] || 'Applicant',
        },
      });
    }
    return candidate;
  };

  // GET /api/applications — list candidate applications
  fastify.get('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const candidate = await ensureCandidate(userId);

      const applications = await prisma.application.findMany({
        where: { candidateId: candidate.id },
        include: {
          job: { include: { company: true, source: true, analysis: true } },
          resumeVersions: { orderBy: { version: 'desc' }, take: 1 },
          attempts: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, applications });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch applications' } });
    }
  });

  // GET /api/applications/:id — get application details
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const numericId = parseInt(id, 10);
    const userId = request.user!.id;

    if (isNaN(numericId)) {
      return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid application ID' } });
    }

    try {
      const candidate = await ensureCandidate(userId);
      const application = await prisma.application.findFirst({
        where: { id: numericId, candidateId: candidate.id },
        include: {
          job: { include: { company: true, source: true, analysis: true } },
          events: { orderBy: { createdAt: 'asc' } },
          attempts: { orderBy: { createdAt: 'desc' } },
          resumeVersions: { orderBy: { version: 'desc' } },
          executionCheckpoint: true,
        },
      });

      if (!application) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Application not found' } });
      }

      return reply.send({ success: true, application });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch application' } });
    }
  });

  // POST /api/applications — create new application & enqueue application task
  fastify.post('/', async (request, reply) => {
    const userId = request.user!.id;

    try {
      const data = CreateApplicationSchema.parse(request.body);
      const candidate = await ensureCandidate(userId);

      const job = await prisma.job.findUnique({ where: { id: data.jobId } });
      if (!job) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
      }

      const canonicalJobId = job.canonicalFingerprint || `job-${job.id}`;

      // Upsert application
      let application = await prisma.application.findUnique({
        where: { candidateId_canonicalJobId: { candidateId: candidate.id, canonicalJobId } },
      });

      if (!application) {
        application = await prisma.application.create({
          data: {
            candidateId: candidate.id,
            jobId: job.id,
            canonicalJobId,
            status: ApplicationStatus.QUEUED,
          },
        });

        await prisma.applicationEvent.create({
          data: {
            applicationId: application.id,
            jobId: job.id,
            eventType: 'APPLICATION_QUEUED',
            payload: { triggeredBy: 'user', providerId: data.providerId },
          },
        });
      } else {
        application = await prisma.application.update({
          where: { id: application.id },
          data: { status: ApplicationStatus.QUEUED },
        });
      }

      // Enqueue background APPLICATION_TASK
      const task = await taskService.createTask(userId, {
        type: 'APPLICATION_TASK',
        payload: {
          applicationId: application.id,
          jobId: job.id,
          providerId: data.providerId,
          targetUrl: job.url,
        },
      });

      return reply.status(201).send({
        success: true,
        application,
        taskId: task.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create application' } });
    }
  });

  // POST /api/applications/:id/apply — trigger or resume application
  fastify.post('/:id/apply', async (request, reply) => {
    const { id } = request.params as { id: string };
    const numericId = parseInt(id, 10);
    const userId = request.user!.id;

    try {
      const candidate = await ensureCandidate(userId);
      const application = await prisma.application.findFirst({
        where: { id: numericId, candidateId: candidate.id },
        include: { job: true },
      });

      if (!application) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Application not found' } });
      }

      await prisma.application.update({
        where: { id: application.id },
        data: { status: ApplicationStatus.QUEUED },
      });

      const task = await taskService.createTask(userId, {
        type: 'APPLICATION_TASK',
        payload: {
          applicationId: application.id,
          jobId: application.jobId,
          providerId: application.job.provider || 'ats-generic',
          targetUrl: application.job.url,
        },
      });

      return reply.send({ success: true, application, taskId: task.id });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to queue application task' } });
    }
  });

  // POST /api/applications/:id/cancel — cancel application
  fastify.post('/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const numericId = parseInt(id, 10);
    const userId = request.user!.id;

    try {
      const candidate = await ensureCandidate(userId);
      const application = await prisma.application.findFirst({
        where: { id: numericId, candidateId: candidate.id },
      });

      if (!application) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Application not found' } });
      }

      const updated = await prisma.application.update({
        where: { id: application.id },
        data: { status: ApplicationStatus.CANCELLED },
      });

      await prisma.applicationEvent.create({
        data: {
          applicationId: application.id,
          jobId: application.jobId,
          eventType: 'APPLICATION_CANCELLED',
          payload: { reason: 'User cancelled application' },
        },
      });

      return reply.send({ success: true, application: updated });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel application' } });
    }
  });

  // POST /api/applications/:id/verify — trigger verification
  fastify.post('/:id/verify', async (request, reply) => {
    const { id } = request.params as { id: string };
    const numericId = parseInt(id, 10);
    const userId = request.user!.id;

    try {
      const candidate = await ensureCandidate(userId);
      const application = await prisma.application.findFirst({
        where: { id: numericId, candidateId: candidate.id },
        include: { job: true },
      });

      if (!application) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Application not found' } });
      }

      const task = await taskService.createTask(userId, {
        type: 'VERIFICATION_TASK',
        payload: {
          applicationId: application.id,
          jobId: application.jobId,
          providerId: application.job.provider || 'ats-generic',
        },
      });

      return reply.send({ success: true, taskId: task.id });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to queue verification task' } });
    }
  });
}
