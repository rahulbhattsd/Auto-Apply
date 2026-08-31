import { Queue } from '@autoapply/queue';
import { connection, QUEUE_NAMES } from '@autoapply/queue';
import { env } from '@autoapply/config';
import { prisma } from '@autoapply/database';

export const discoveryQueue = new Queue(QUEUE_NAMES.JOB_DISCOVERY, { connection });

export async function startScheduler() {
  const interval = (env.JOB_DISCOVERY_INTERVAL_MINUTES || 30) * 60 * 1000;

  setInterval(async () => {
    try {
      const activeConfigs = await prisma.automationConfig.findMany({
        where: {
          autoApplyEnabled: true,
          workerStatus: 'RUNNING',
        },
      });

      for (const config of activeConfigs) {
        await discoveryQueue.add('discover-jobs', { userId: config.userId }, {
          jobId: `discovery-${config.userId}-${Date.now()}`
        });

        const now = new Date();
        await prisma.automationConfig.update({
          where: { id: config.id },
          data: {
            lastDiscoveryRun: now,
            nextDiscoveryRun: new Date(now.getTime() + interval)
          }
        });
      }
    } catch (e) {
      console.error('Scheduler error', e);
    }
  }, interval);
}
