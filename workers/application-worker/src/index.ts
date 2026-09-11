
import { chromium } from 'playwright';
import { Worker, QUEUE_NAMES, connection, Queue, RETRY_POLICIES, DEFAULT_JOB_OPTIONS } from '@autoapply/queue';
import { prisma, recordDeadLetter } from '@autoapply/database';
import { closeApplicationEngine, transitionApplication } from '@autoapply/application-engine';
import { env } from '@autoapply/config';
import { GreenhouseAdapter } from './adapters/GreenhouseAdapter';
import { LeverAdapter } from './adapters/LeverAdapter';
import { GenericFallbackAdapter } from './adapters/GenericFallbackAdapter';
import { WorkdayAdapter } from './adapters/WorkdayAdapter';
import { DarwinboxAdapter } from './adapters/DarwinboxAdapter';

import fs from 'fs';
import { exec } from 'child_process';
import jwt from 'jsonwebtoken';

const verificationQueue = new Queue(QUEUE_NAMES.VERIFICATION, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
const adapters = [new GreenhouseAdapter(), new LeverAdapter(), new WorkdayAdapter(), new DarwinboxAdapter(), new GenericFallbackAdapter()];

import { downloadResumeFromS3 } from './utils/s3';

let activeHandoffs = 0;

const execAsync = (command: string): Promise<{ stdout: string, stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

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
    const fileUrl = latestResume?.basedOnMasterResume.fileUrl;

    if (!fileUrl) {
      throw new Error(`No generated resume is available for application ${applicationId}`);
    }

    const tempResumePath = await downloadResumeFromS3(applicationId, fileUrl);

    const browser = await chromium.launch({ headless: env.PLAYWRIGHT_HEADLESS });
    let page;
    try {
      page = await browser.newPage();
      await adapter.inspect(page, application.job.url);
      await adapter.fill(page, application.candidate, tempResumePath);
      const submitted = await adapter.submit(page);

      if (!submitted.confirmed) {
        await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: 'SUBMISSION_NOT_CONFIRMED' });
        return;
      }

      await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: submitted.evidence });
      await verificationQueue.add('verify-application', { applicationId: application.id }, {
        attempts: RETRY_POLICIES.DEFAULT.attempts,
        backoff: RETRY_POLICIES.DEFAULT.backoff,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('CAPTCHA_DETECTED') || message.includes('cloudflare') || message.includes('ACCOUNT_REQUIRED')) {
        if (activeHandoffs >= env.MAX_CONCURRENT_HUMAN_HANDOFFS) {
          await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: message + ' (Handoff limit reached)' });
          return;
        }

        activeHandoffs++;
        try {
          const storageState = await page?.context().storageState();
          await browser.close(); // Close headless browser

          const displayNumber = 99 + activeHandoffs; // e.g. 100, 101, 102
          const wsPort = 6000 + displayNumber;
          const vncPort = 5900 + displayNumber;

          // Start xvfb, x11vnc and websockify
          const startCmd = `
            Xvfb :${displayNumber} -screen 0 1280x800x24 &
            sleep 1;
            x11vnc -display :${displayNumber} -nopw -listen localhost -xkb -ncache 10 -ncache_cr -forever -shared -bg -rfbport ${vncPort};
            websockify --web=/usr/share/novnc ${wsPort} localhost:${vncPort} &
          `;
          const processEnv = { ...process.env, DISPLAY: `:${displayNumber}` };

          await execAsync(startCmd);

          const token = jwt.sign({ applicationId, userId: application.candidate.userId }, env.JWT_SECRET, { expiresIn: '10m' });
          const connectionInfo = { port: wsPort, host: env.HOST === '0.0.0.0' ? 'localhost' : env.HOST };
          await connection.set(`novnc:${token}`, JSON.stringify(connectionInfo), 'EX', 600);

          await transitionApplication(application.id, 'AWAITING_HUMAN_VERIFICATION', { token, reason: message });

          // Launch headed browser in xvfb
          const headedBrowser = await chromium.launch({ headless: false, env: processEnv });
          const headedContext = await headedBrowser.newContext(storageState ? { storageState } : undefined);
          const headedPage = await headedContext.newPage();

          try {
            // Wait up to 10 minutes for CAPTCHA to resolve
            await headedPage.goto(application.job.url);

            // Wait for something indicating success, e.g. no more captcha iframes
            await headedPage.waitForFunction(() => {
              return document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="cloudflare"]').length === 0;
            }, { timeout: 600000 });

            // Resumed by human, continue applying
            await transitionApplication(application.id, 'APPLYING', { reason: 'Resolved by human' });

            await adapter.fill(headedPage, application.candidate, tempResumePath);
            const submitted = await adapter.submit(headedPage);

            if (!submitted.confirmed) {
              await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: 'SUBMISSION_NOT_CONFIRMED' });
            } else {
              await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: submitted.evidence });
              await verificationQueue.add('verify-application', { applicationId: application.id }, {
                attempts: RETRY_POLICIES.DEFAULT.attempts,
                backoff: RETRY_POLICIES.DEFAULT.backoff,
              });
            }
          } catch (e) {
             await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: 'VERIFICATION_TIMEOUT' });
             await recordDeadLetter({
                jobId: job.id!,
                queueName: QUEUE_NAMES.APPLICATION,
                error: 'VERIFICATION_TIMEOUT',
                attemptCount: job.attemptsMade,
                stackTrace: (e instanceof Error ? e.stack : null) || null,
              });
          } finally {
            await headedBrowser.close();
            // Cleanup processes mapped to this display
            await execAsync(`pkill -f ":${displayNumber}" || true; pkill -f "${wsPort}" || true`);
            activeHandoffs--;
          }
        } catch (innerErr) {
           activeHandoffs--;
           throw innerErr;
        }

        return; // Exited the human handoff flow
      } else if (message.includes('MFA_DETECTED') || message.includes('UNKNOWN_REQUIRED_FIELD')) {
        await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: message });
        return;
      }

      throw error;
    } finally {
      if (browser.isConnected()) await browser.close();
      if (fs.existsSync(tempResumePath)) {
        fs.unlinkSync(tempResumePath);
      }
    }
  },
  { connection, concurrency: env.MAX_CONCURRENT_APPLICATIONS }
);
worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        try {
          const applicationId = Number(job.data.applicationId);
          const app = await prisma.application.findUnique({ where: { id: applicationId } });

          if (app && (app.status === 'APPLYING' || app.status === 'VERIFYING')) {
            await transitionApplication(applicationId, 'NEEDS_HUMAN', { reason: err.message });
          } else {
            console.log(`[ApplicationWorker] Application ${applicationId} is in status ${app?.status}, skipping transition to NEEDS_HUMAN`);
          }
        } catch (transitionErr) {
          console.error(`[ApplicationWorker] Failed to transition application ${job?.data?.applicationId} to NEEDS_HUMAN:`, transitionErr);
        }

        await recordDeadLetter({
          jobId: job.id!,
          queueName: QUEUE_NAMES.APPLICATION,
          error: err.message,
          attemptCount: job.attemptsMade,
          stackTrace: err.stack || null,
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
