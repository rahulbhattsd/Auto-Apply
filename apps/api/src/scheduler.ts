import { Queue, DEFAULT_JOB_OPTIONS } from '@autoapply/queue';
import { connection, QUEUE_NAMES, RETRY_POLICIES } from '@autoapply/queue';
import { env } from '@autoapply/config';
import { prisma } from '@autoapply/database';

export const discoveryQueue = new Queue(QUEUE_NAMES.JOB_DISCOVERY, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
let schedulerTimer: NodeJS.Timeout | undefined;

export async function startScheduler() {
  const interval = (env.JOB_DISCOVERY_INTERVAL_MINUTES || 30) * 60 * 1000;
  const instanceId = Math.random().toString(36).substring(2, 15);

  if (schedulerTimer) return;

  const runOnce = async () => {
    const lockKey = 'lock:discovery-scheduler';
    const lockTtlMs = Math.floor(interval / 2); // Ensure it expires before the next tick

    // Attempt to acquire the lock
    const acquired = await connection.set(lockKey, instanceId, 'PX', lockTtlMs, 'NX');

    if (!acquired) {
      console.log(`[Scheduler] Lock not acquired, another instance is running the scheduler.`);
      return;
    }

    try {
      await scheduleActiveUsers(interval);
    } finally {
      // We do not immediately release the lock so that other instances within the same time bucket
      // do not run it. It will expire naturally before the next interval.
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
