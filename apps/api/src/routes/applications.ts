import { FastifyInstance } from 'fastify';
import { prisma } from '@autoapply/database';
import { Queue, QUEUE_NAMES, connection, RETRY_POLICIES } from '@autoapply/queue';
import { transitionApplication } from '@autoapply/application-engine';
import { verifyToken } from '../middleware/auth';

export default async function applicationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.get('/api/applications', async (request, reply) => {
    const userId = request.user!.id;
    const applications = await prisma.application.findMany({
      where: { candidate: { userId } },
      include: {
        job: { include: { company: true, source: true, analysis: true } },
        resumeVersions: { orderBy: { version: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' }
    });
    return reply.send({ applications });
  });

  fastify.get('/api/applications/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const application = await prisma.application.findFirst({
      where: { id: parseInt(id, 10), candidate: { userId } },
      include: {
        job: { include: { company: true, source: true, analysis: true } },
        events: { orderBy: { createdAt: 'asc' } },
        resumeVersions: { orderBy: { version: 'desc' }, take: 1 }
      }
    });
    if (!application) return reply.status(404).send({ success: false, error: { code: 'ERROR', message: 'Application not found' } });
    return reply.send({ application });
  });

  fastify.post('/api/applications/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const application = await prisma.application.findFirst({
      where: { id: parseInt(id, 10), candidate: { userId }, status: 'NEEDS_HUMAN' }
    });
    if (!application) return reply.status(404).send({ success: false, error: { code: 'ERROR', message: 'Application not found or not in NEEDS_HUMAN state' } });

    const applicationQueue = new Queue(QUEUE_NAMES.APPLICATION, { connection });
    await applicationQueue.add('resume-application', { applicationId: application.id }, {
      attempts: RETRY_POLICIES.BROWSER_ERROR.attempts,
      backoff: RETRY_POLICIES.BROWSER_ERROR.backoff,
    });
    await prisma.auditLog.create({ data: { userId, action: 'RESUME_APPLICATION', targetType: 'Application', targetId: application.id } });
    return reply.send({ success: true, application });
  });

  fastify.post('/api/applications/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const application = await prisma.application.findFirst({
      where: { id: parseInt(id, 10), candidate: { userId } }
    });
    if (!application) return reply.status(404).send({ success: false, error: { code: 'ERROR', message: 'Application not found' } });

    const updatedApp = await transitionApplication(application.id, 'CANCELLED', { reason: 'Cancelled by human' });
    await prisma.auditLog.create({ data: { userId, action: 'CANCEL_APPLICATION', targetType: 'Application', targetId: application.id } });
    return reply.send({ success: true, application: updatedApp });
  });

  fastify.post('/api/applications/:id/mark-completed', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const application = await prisma.application.findFirst({
      where: { id: parseInt(id, 10), candidate: { userId }, status: 'NEEDS_HUMAN' }
    });
    if (!application) return reply.status(404).send({ success: false, error: { code: 'ERROR', message: 'Application not found or not in NEEDS_HUMAN state' } });

    await transitionApplication(application.id, 'APPLYING', { reason: 'Manually marked completed by human' });
    await transitionApplication(application.id, 'SUBMITTED', { reason: 'Manually marked completed by human' });
    await transitionApplication(application.id, 'VERIFYING', { reason: 'Manually marked completed by human' });
    const updatedApp = await transitionApplication(application.id, 'VERIFIED', { reason: 'Manually marked completed by human' });
    await prisma.auditLog.create({ data: { userId, action: 'MARK_COMPLETED_APPLICATION', targetType: 'Application', targetId: application.id } });
    return reply.send({ success: true, application: updatedApp });
  });
}
