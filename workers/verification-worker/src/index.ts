import { Worker, QUEUE_NAMES, connection } from '@autoapply/queue';
import { prisma } from '@autoapply/database';

const worker = new Worker(
  QUEUE_NAMES.VERIFICATION,
  async (job) => {
    console.log(`[VerificationWorker] Stub processing job ${job.id}`);
    console.log(`[VerificationWorker] Real verification logic not implemented in this phase.`);
  },
  { connection }
);
worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        await prisma.deadLetter.create({
            data: {
                jobId: job.id!,
                queueName: QUEUE_NAMES.VERIFICATION,
                error: err.message,
                attemptCount: job.attemptsMade,
                stackTrace: err.stack || null
            }
        });
    }
});
worker.on('ready', () => console.log('Verification Worker (Stub) started'));
