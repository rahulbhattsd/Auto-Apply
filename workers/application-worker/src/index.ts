import path from 'path';
import { chromium } from 'playwright';
import { Worker, QUEUE_NAMES, connection, Queue } from '@autoapply/queue';
import { prisma } from '@autoapply/database';
import { closeApplicationEngine, transitionApplication } from '@autoapply/application-engine';
import { env } from '@autoapply/config';
import { GreenhouseAdapter } from './adapters/GreenhouseAdapter';
import { LeverAdapter } from './adapters/LeverAdapter';

const verificationQueue = new Queue(QUEUE_NAMES.VERIFICATION, { connection });
const adapters = [new GreenhouseAdapter(), new LeverAdapter()];

const worker = new Worker(
  QUEUE_NAMES.APPLICATION,
  async (job) => {
    const applicationId = Number(job.data.applicationId);
    console.log(`[ApplicationWorker] Processing application ${applicationId} from job ${job.id}`);

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: { include: { user: true } },
        job: true,
        resumeVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { basedOnMasterResume: true },
        },
      },
    });

    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    if (application.status === 'NEEDS_HUMAN') {
      await transitionApplication(application.id, 'APPLYING', { reason: 'Resumed by human' });
    } else if (application.status === 'READY_TO_APPLY') {
      await transitionApplication(application.id, 'APPLYING');
    } else if (application.status !== 'APPLYING') {
      throw new Error(`Application ${applicationId} is not ready to submit; current status is ${application.status}`);
    }

    const adapter = adapters.find((candidateAdapter) => candidateAdapter.canHandle(application.job.url));
    if (!adapter) {
      await transitionApplication(application.id, 'NEEDS_HUMAN', {
        reason: 'UNSUPPORTED_APPLICATION_SITE',
        url: application.job.url,
      });
      return;
    }

    const latestResume = application.resumeVersions[0];
    const resumePath = latestResume?.basedOnMasterResume.fileUrl.startsWith('/uploads/')
      ? path.join(env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'), path.basename(latestResume.basedOnMasterResume.fileUrl))
      : latestResume?.basedOnMasterResume.fileUrl;

    if (!resumePath) {
      throw new Error(`No generated resume is available for application ${applicationId}`);
    }

    const browser = await chromium.launch({ headless: env.PLAYWRIGHT_HEADLESS });
    try {
      const page = await browser.newPage();
      await adapter.inspect(page, application.job.url);
      await adapter.fill(page, application.candidate, resumePath);
      const submitted = await adapter.submit(page);

      if (!submitted) {
        await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: 'SUBMISSION_NOT_CONFIRMED' });
        return;
      }

      await transitionApplication(application.id, 'SUBMITTED');
      await verificationQueue.add('verify-application', { applicationId: application.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('CAPTCHA_DETECTED') || message.includes('MFA_DETECTED')) {
        await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: message });
        return;
      }

      throw error;
    } finally {
      await browser.close();
    }
  },
  { connection }
);
worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        await prisma.deadLetter.create({
            data: {
                jobId: job.id!,
                queueName: QUEUE_NAMES.APPLICATION,
                error: err.message,
                attemptCount: job.attemptsMade,
                stackTrace: err.stack || null
            }
        });
    }
});
worker.on('ready', () => console.log('Application Worker started'));

const shutdown = async () => {
  await worker.close();
  await verificationQueue.close();
  await closeApplicationEngine();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
