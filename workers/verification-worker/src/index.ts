import { Worker, QUEUE_NAMES, connection } from '@autoapply/queue';
import { prisma } from '@autoapply/database';
import { closeApplicationEngine, transitionApplication } from '@autoapply/application-engine';

const worker = new Worker(
  QUEUE_NAMES.VERIFICATION,
  async (job) => {
    const applicationId = Number(job.data.applicationId);
    console.log(`[VerificationWorker] Verifying application ${applicationId} from job ${job.id}`);

    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    if (application.status === 'SUBMITTED') {
      await transitionApplication(application.id, 'VERIFYING');
    } else if (application.status !== 'VERIFYING') {
      throw new Error(`Application ${applicationId} is not submitted; current status is ${application.status}`);
    }

    await transitionApplication(application.id, 'VERIFIED', {
      verification: 'submission_recorded',
    });
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
worker.on('ready', () => console.log('Verification Worker started'));

const shutdown = async () => {
  await worker.close();
  await closeApplicationEngine();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
