import { QueueEvents } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { QUEUE_NAMES, connection } from './index.js';

const prisma = new PrismaClient();

export function setupJobTracker() {
  for (const qName of Object.values(QUEUE_NAMES)) {
    const queueEvents = new QueueEvents(qName, { connection });

    queueEvents.on('added', async ({ jobId }) => {
      await prisma.workerJob.upsert({
        where: { queueName_jobId: { queueName: qName, jobId } },
        update: { state: 'waiting' },
        create: { queueName: qName, jobId, state: 'waiting', attempts: 0 },
      });
    });

    queueEvents.on('active', async ({ jobId }) => {
      await prisma.workerJob.updateMany({
        where: { queueName: qName, jobId },
        data: { state: 'active' },
      });
    });

    queueEvents.on('completed', async ({ jobId }) => {
      await prisma.workerJob.updateMany({
        where: { queueName: qName, jobId },
        data: { state: 'completed' },
      });
    });

    queueEvents.on('failed', async ({ jobId }) => {
      await prisma.workerJob.updateMany({
        where: { queueName: qName, jobId },
        data: { state: 'failed' },
      });
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
