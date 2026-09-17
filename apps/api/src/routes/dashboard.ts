import { FastifyInstance } from 'fastify';
import { prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth.js';
import { getWorkerHeartbeats } from '@autoapply/queue';

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.get('/api/dashboard', async (request, reply) => {
    const userId = request.user!.id;

    try {
      const [
        user,
        recentConversations,
        totalConversations,
        totalMemories,
        tasksSummary,
        recentTasks,
        workerHeartbeats,
      ] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          include: { profile: true },
        }),
        prisma.conversation.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            updatedAt: true,
            _count: { select: { messages: true } },
          },
        }),
        prisma.conversation.count({ where: { userId } }),
        prisma.memory.count({ where: { userId } }),
        prisma.task.groupBy({
          by: ['status'],
          where: { userId },
          _count: { status: true },
        }),
        prisma.task.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        getWorkerHeartbeats(45000).catch(() => []),
      ]);

      const taskCounts: Record<string, number> = {
        QUEUED: 0,
        RUNNING: 0,
        COMPLETED: 0,
        FAILED: 0,
        CANCELLED: 0,
      };

      for (const item of tasksSummary) {
        taskCounts[item.status] = item._count.status;
      }

      const activeWorkersCount = workerHeartbeats.filter(w => w.status === 'HEALTHY' || w.status === 'BUSY').length;

      return reply.send({
        success: true,
        user: {
          name: user?.profile?.displayName || user?.email.split('@')[0] || 'User',
          email: user?.email,
          timezone: user?.profile?.timezone || 'UTC',
        },
        stats: {
          totalConversations,
          totalMemories,
          tasks: taskCounts,
          activeWorkers: activeWorkersCount,
        },
        recentConversations,
        recentTasks,
        workers: workerHeartbeats,
        systemHealth: {
          status: 'ok',
          database: 'connected',
          workersHealthy: activeWorkersCount > 0,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard data' },
      });
    }
  });
}
