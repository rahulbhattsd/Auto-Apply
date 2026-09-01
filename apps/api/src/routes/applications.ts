import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '@autoapply/database';
import { Queue, QUEUE_NAMES, connection } from '@autoapply/queue';

const getUserId = (req: FastifyRequest) => {
  const headerId = req.headers['x-user-id'];
  return headerId ? parseInt(headerId as string, 10) : 1;
};

export default async function applicationsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/applications', async (request, reply) => {
    const userId = getUserId(request);
    const applications = await prisma.application.findMany({
      where: { candidateId: userId },
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
    const userId = getUserId(request);
    const application = await prisma.application.findFirst({
      where: { id: parseInt(id, 10), candidateId: userId },
      include: {
        job: { include: { company: true, source: true, analysis: true } },
        events: { orderBy: { createdAt: 'asc' } },
        resumeVersions: { orderBy: { version: 'desc' }, take: 1 }
      }
    });
    if (!application) return reply.status(404).send({ error: 'Application not found' });
    return reply.send({ application });
  });

  fastify.post('/api/applications/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = getUserId(request);
    const application = await prisma.application.findFirst({
      where: { id: parseInt(id, 10), candidateId: userId, status: 'NEEDS_HUMAN' }
    });
    if (!application) return reply.status(404).send({ error: 'Application not found or not in NEEDS_HUMAN state' });

    const applicationQueue = new Queue(QUEUE_NAMES.APPLICATION, { connection });
    await applicationQueue.add('resume-application', { applicationId: application.id });

    const updatedApp = await prisma.application.update({
      where: { id: application.id },
      data: { status: 'APPLYING' }
    });
    await prisma.applicationEvent.create({
      data: { applicationId: application.id, jobId: application.jobId, eventType: 'APPLYING', payload: { reason: 'Resumed by human' } }
    });
    return reply.send({ success: true, application: updatedApp });
  });

  fastify.post('/api/applications/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = getUserId(request);
    const application = await prisma.application.findFirst({
      where: { id: parseInt(id, 10), candidateId: userId }
    });
    if (!application) return reply.status(404).send({ error: 'Application not found' });

    const updatedApp = await prisma.application.update({
      where: { id: application.id },
      data: { status: 'CANCELLED' }
    });
    await prisma.applicationEvent.create({
      data: { applicationId: application.id, jobId: application.jobId, eventType: 'CANCELLED', payload: { reason: 'Cancelled by human' } }
    });
    return reply.send({ success: true, application: updatedApp });
  });

  fastify.post('/api/applications/:id/mark-completed', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = getUserId(request);
    const application = await prisma.application.findFirst({
      where: { id: parseInt(id, 10), candidateId: userId, status: 'NEEDS_HUMAN' }
    });
    if (!application) return reply.status(404).send({ error: 'Application not found or not in NEEDS_HUMAN state' });

    const updatedApp = await prisma.application.update({
      where: { id: application.id },
      data: { status: 'VERIFIED' }
    });
    await prisma.applicationEvent.create({
      data: { applicationId: application.id, jobId: application.jobId, eventType: 'VERIFIED', payload: { reason: 'Manually marked completed by human' } }
    });
    return reply.send({ success: true, application: updatedApp });
  });
}
