import { Worker, QUEUE_NAMES, connection } from '@autoapply/queue';
import { transitionApplication } from '@autoapply/application-engine';
import { prisma } from '@autoapply/database';

const worker = new Worker(
  QUEUE_NAMES.RESUME_GENERATION,
  async (job) => {
    console.log(`[ResumeWorker] Stub processing job ${job.id}`);
    const { applicationId } = job.data;

    await transitionApplication(applicationId, 'RESUME_GENERATING');

    console.log(`[ResumeWorker] Application ${applicationId} transitioned to RESUME_GENERATING. Further logic not implemented in this phase.`);
  },
  { connection }
);
worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        await prisma.deadLetter.create({
            data: {
                jobId: job.id!,
                queueName: QUEUE_NAMES.RESUME_GENERATION,
                error: err.message,
                attemptCount: job.attemptsMade,
                stackTrace: err.stack || null
            }
        });
    }
});
worker.on('ready', () => console.log('Resume Worker (Stub) started'));
