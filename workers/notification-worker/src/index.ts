import { Worker, QUEUE_NAMES, connection } from '@autoapply/queue';
import { prisma } from '@autoapply/database';
import { EmailNotificationProvider, NotificationPayload } from '@autoapply/shared';

const provider = new EmailNotificationProvider();

const worker = new Worker(
  QUEUE_NAMES.NOTIFICATIONS,
  async (job) => {
    const payload = job.data as NotificationPayload;
    console.log(`[NotificationWorker] Processing notification job ${job.id} of type ${payload.type}`);

    try {
      await provider.notify(payload);

      await prisma.notification.create({
        data: {
          type: payload.type,
          recipient: payload.recipient,
          payload: payload.metadata ? JSON.parse(JSON.stringify(payload.metadata)) : undefined,
          ...(payload.relatedApplicationId ? { relatedApplicationId: payload.relatedApplicationId } : {}),
          sentAt: new Date(),
        }
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`[NotificationWorker] Failed to send notification: ${err.message}`);
      }
      throw err;
    }
  },
  { connection }
);

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
    await prisma.deadLetter.create({
      data: {
        jobId: job.id!,
        queueName: QUEUE_NAMES.NOTIFICATIONS,
        error: err.message,
        attemptCount: job.attemptsMade,
        stackTrace: err.stack || null
      }
    });
  }
});

worker.on('ready', () => console.log('Notification Worker started'));

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
