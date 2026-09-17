import { QueueEvents } from 'bullmq';
import { prisma } from '@autoapply/database';
import { QUEUE_NAMES, connection } from './index.js';

export function setupJobTracker() {
  const activeQueues = [QUEUE_NAMES.AGENT_TASKS, QUEUE_NAMES.NOTIFICATIONS];

  for (const qName of activeQueues) {
    const queueEvents = new QueueEvents(qName, { connection });

    queueEvents.on('added', async ({ jobId }) => {
      try {
        await prisma.workerJob.upsert({
          where: { queueName_jobId: { queueName: qName, jobId } },
          update: { state: 'waiting' },
          create: { queueName: qName, jobId, state: 'waiting', attempts: 0 },
        });
      } catch (err) {
        console.error(`Failed to track added job ${jobId} in ${qName}:`, err);
      }
    });

    queueEvents.on('active', async ({ jobId }) => {
      try {
        await prisma.workerJob.updateMany({
          where: { queueName: qName, jobId },
          data: { state: 'active' },
        });
      } catch (err) {
        console.error(`Failed to track active job ${jobId} in ${qName}:`, err);
      }
    });

    queueEvents.on('completed', async ({ jobId }) => {
      try {
        await prisma.workerJob.updateMany({
          where: { queueName: qName, jobId },
          data: { state: 'completed' },
        });
      } catch (err) {
        console.error(`Failed to track completed job ${jobId} in ${qName}:`, err);
      }
    });

    queueEvents.on('failed', async ({ jobId }) => {
      try {
        await prisma.workerJob.updateMany({
          where: { queueName: qName, jobId },
          data: { state: 'failed' },
        });
      } catch (err) {
        console.error(`Failed to track failed job ${jobId} in ${qName}:`, err);
      }
    });
  }
}

export async function checkWorkerHealth() {
  try {
    const ping = await connection.ping();
    return ping === 'PONG';
  } catch {
    return false;
  }
}
