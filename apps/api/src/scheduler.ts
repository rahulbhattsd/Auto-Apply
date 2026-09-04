import { Queue } from '@autoapply/queue';
import { connection, QUEUE_NAMES, RETRY_POLICIES } from '@autoapply/queue';
import { env } from '@autoapply/config';
import { prisma } from '@autoapply/database';

export const discoveryQueue = new Queue(QUEUE_NAMES.JOB_DISCOVERY, { connection });
let schedulerTimer: NodeJS.Timeout | undefined;
let schedulerRunning = false;

export async function startScheduler() {
  const interval = (env.JOB_DISCOVERY_INTERVAL_MINUTES || 30) * 60 * 1000;

  if (schedulerTimer) return;

  const runOnce = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      await scheduleActiveUsers(interval);
    } finally {
      schedulerRunning = false;
    }
  };

  await runOnce();
  schedulerTimer = setInterval(runOnce, interval);
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = undefined;
  }
}

async function scheduleActiveUsers(interval: number) {
  try {
    const activeConfigs = await prisma.automationConfig.findMany({
      where: {
        autoApplyEnabled: true,
        workerStatus: 'RUNNING',
      },
    });

    const now = new Date();
    const bucket = Math.floor(now.getTime() / interval);

    for (const config of activeConfigs) {
      await discoveryQueue.add('discover-jobs', { userId: config.userId }, {
        jobId: `discovery-${config.userId}-${bucket}`,
        attempts: RETRY_POLICIES.NETWORK_ERROR.attempts,
        backoff: RETRY_POLICIES.NETWORK_ERROR.backoff,
      });

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
}
