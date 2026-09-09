import { Worker, QUEUE_NAMES, connection } from '@autoapply/queue';
import { prisma, recordDeadLetter } from '@autoapply/database';
import { closeApplicationEngine, transitionApplication } from '@autoapply/application-engine';

const worker = new Worker(
  QUEUE_NAMES.VERIFICATION,
  async (job) => {
    const applicationId = Number(job.data.applicationId);
    console.log(`[VerificationWorker] Verifying application ${applicationId} from job ${job.id}`);

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { events: { where: { eventType: 'SUBMITTED' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    if (application.status === 'SUBMITTED') {
      await transitionApplication(application.id, 'VERIFYING');
    } else if (application.status !== 'VERIFYING') {
      throw new Error(`Application ${applicationId} is not submitted; current status is ${application.status}`);
    }

    const payload = application.events[0]?.payload as { submissionEvidence?: Record<string, unknown> } | null;
    const evidence = payload?.submissionEvidence;
    const hasEvidence = Boolean(
      evidence?.['confirmationUrl'] || evidence?.['confirmationText'] || evidence?.['referenceId']
    );

    if (!hasEvidence) {
      await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: 'VERIFICATION_EVIDENCE_MISSING' });
      return;
    }

    await transitionApplication(application.id, 'VERIFIED', { verification: 'confirmed_submission_evidence', evidence });
  },
  { connection }
);
worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
    try {
      const applicationId = Number(job.data.applicationId);
      const app = await prisma.application.findUnique({ where: { id: applicationId } });

      if (app && (app.status === 'VERIFYING' || app.status === 'SUBMITTED')) {
        await transitionApplication(applicationId, 'NEEDS_HUMAN', { reason: err.message });
      } else {
        console.log(`[VerificationWorker] Application ${applicationId} is in status ${app?.status}, skipping transition to NEEDS_HUMAN`);
      }
    } catch (transitionErr) {
      console.error(`[VerificationWorker] Failed to transition application ${job?.data?.applicationId} to NEEDS_HUMAN:`, transitionErr);
    }

    await recordDeadLetter({
      jobId: job.id!,
      queueName: QUEUE_NAMES.VERIFICATION,
      error: err.message,
      attemptCount: job.attemptsMade,
      stackTrace: err.stack || null,
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
