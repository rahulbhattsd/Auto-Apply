import { FastifyInstance } from 'fastify';
import { prisma } from '@autoapply/database';
import { agentTaskQueue } from '@autoapply/queue';

export default async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/metrics', async (_request, reply) => {
    try {
      const [
        totalUsers,
        totalConversations,
        totalMessages,
        totalMemories,
        queuedTasks,
        runningTasks,
        completedTasks,
        failedTasks,
        deadLettersCount,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.conversation.count(),
        prisma.message.count(),
        prisma.memory.count(),
        prisma.task.count({ where: { status: 'QUEUED' } }),
        prisma.task.count({ where: { status: 'RUNNING' } }),
        prisma.task.count({ where: { status: 'COMPLETED' } }),
        prisma.task.count({ where: { status: 'FAILED' } }),
        prisma.deadLetter.count(),
      ]);

      // BullMQ queue counts
      let bullmqWaiting = 0;
      let bullmqActive = 0;
      try {
        bullmqWaiting = await agentTaskQueue.count();
        bullmqActive = await agentTaskQueue.getActiveCount();
      } catch {
        // Redis might be offline
      }

      return reply.send({
        success: true,
        data: {
          users: { total: totalUsers },
          conversations: { total: totalConversations, messages: totalMessages },
          memories: { total: totalMemories },
          tasks: {
            queued: queuedTasks,
            running: runningTasks,
            completed: completedTasks,
            failed: failedTasks,
            queueDepth: bullmqWaiting,
            activeJobs: bullmqActive,
          },
          resilience: {
            deadLetters: deadLettersCount,
          },
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch metrics' },
      });
    }
  });
}
