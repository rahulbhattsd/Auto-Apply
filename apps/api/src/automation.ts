import { FastifyInstance } from 'fastify';
import { prisma } from '@autoapply/database';
import { env } from '@autoapply/config';
import { QUEUE_NAMES, Queue } from '@autoapply/queue';
import { connection } from '@autoapply/queue';
import { verifyToken } from './middleware/auth';

export default async function automationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.get('/api/automation', async (request) => {
    const userId = request.user!.id;
    const config = await prisma.automationConfig.findFirst({ where: { userId }});
    const profile = await prisma.candidateProfile.findUnique({ where: { userId } });

    const depths: Record<string, number> = {};
    for (const qName of Object.values(QUEUE_NAMES)) {
      const q = new Queue(qName, { connection });
      depths[qName] = await q.count();
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appsToday = await prisma.application.count({
      where: {
        candidateId: profile?.id ?? -1,
        createdAt: { gte: today },
      }
    });

    return {
      status: config?.workerStatus || 'STOPPED',
      autoApplyEnabled: config?.autoApplyEnabled || false,
      lastDiscoveryRun: config?.lastDiscoveryRun,
      nextDiscoveryRun: config?.nextDiscoveryRun,
      queueDepths: depths,
      applicationsToday: appsToday,
      limit: env.MAX_APPLICATIONS_PER_DAY,
    };
  });

  fastify.post('/api/automation/start', async (request) => {
    const userId = request.user!.id;
    let config = await prisma.automationConfig.findUnique({ where: { userId }});
    if (config) {
      config = await prisma.automationConfig.update({
        where: { userId },
        data: { workerStatus: 'RUNNING', autoApplyEnabled: true }
      });
    } else {
      config = await prisma.automationConfig.create({
        data: { userId, workerStatus: 'RUNNING', autoApplyEnabled: true }
      });
    }
    return { status: 'RUNNING', config };
  });

  fastify.post('/api/automation/pause', async (request) => {
    const userId = request.user!.id;
    let config = await prisma.automationConfig.findUnique({ where: { userId }});
    if (config) {
      config = await prisma.automationConfig.update({
        where: { userId },
        data: { workerStatus: 'STOPPED', autoApplyEnabled: false }
      });
    } else {
      config = await prisma.automationConfig.create({
        data: { userId, workerStatus: 'STOPPED', autoApplyEnabled: false }
      });
    }
    return { status: 'STOPPED', config };
  });
}
