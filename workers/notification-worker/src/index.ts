import { Worker, QUEUE_NAMES, connection, reportWorkerHeartbeat } from '@autoapply/queue';
import { prisma, recordDeadLetter } from '@autoapply/database';
import { EmailNotificationProvider, NotificationPayload } from '@autoapply/shared';
import { env } from '@autoapply/config';

const WORKER_NAME = 'notification-worker';
const WORKER_ID = `notification-worker-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
const startTime = Date.now();
let currentJobId: string | null = null;
let currentStatus: 'HEALTHY' | 'BUSY' | 'IDLE' = 'IDLE';

const provider = new EmailNotificationProvider();

// Heartbeat Loop (every 15 seconds)
const heartbeatInterval = setInterval(async () => {
  try {
    const memoryMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    await reportWorkerHeartbeat({
      workerName: WORKER_NAME,
      workerId: WORKER_ID,
      status: currentStatus,
      lastHeartbeat: new Date().toISOString(),
      currentJob: currentJobId,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '1.0.0',
      pid: process.pid,
      memoryUsageMb: memoryMb,
    });
  } catch (err) {
    console.warn(`[NotificationWorker] Failed to report heartbeat:`, err);
  }
}, env.WORKER_HEARTBEAT_INTERVAL_MS || 15000);

heartbeatInterval.unref();

const worker = new Worker(
  QUEUE_NAMES.NOTIFICATIONS,
  async (job) => {
    currentJobId = job.id || null;
    currentStatus = 'BUSY';
    const payload = job.data as NotificationPayload;
    console.log(`[NotificationWorker] Processing notification job ${job.id} of type ${payload.type}`);

    try {
      await provider.notify(payload);

      // Audit notification sent
      if (payload.metadata?.['userId']) {
        const userId = Number(payload.metadata['userId']);
        if (!isNaN(userId)) {
          await prisma.auditLog.create({
            data: {
              userId,
              action: 'NOTIFICATION_SENT',
              targetType: 'Notification',
              targetId: 0,
              metadata: {
                type: payload.type,
                recipient: payload.recipient,
              },
            },
          });
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`[NotificationWorker] Failed to send notification: ${err.message}`);
      }
      throw err;
    } finally {
      currentJobId = null;
      currentStatus = 'IDLE';
    }
  },
  { connection }
);

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
    await recordDeadLetter({
      jobId: job.id!,
      queueName: QUEUE_NAMES.NOTIFICATIONS,
      error: err.message,
      attemptCount: job.attemptsMade,
      stackTrace: err.stack || null,
    });
  }
});

worker.on('ready', () => console.log(`[NotificationWorker] Worker ${WORKER_ID} started and ready`));

const shutdown = async (signal: string) => {
  console.log(`[NotificationWorker] Received ${signal}, closing worker gracefully...`);
  clearInterval(heartbeatInterval);
  try {
    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
    console.log('[NotificationWorker] Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('[NotificationWorker] Error during shutdown:', err);
    process.exit(1);
  }
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
