
import { chromium } from 'playwright';
import { Worker, QUEUE_NAMES, connection, Queue, RETRY_POLICIES, DEFAULT_JOB_OPTIONS } from '@autoapply/queue';
import { prisma, recordDeadLetter } from '@autoapply/database';
import { closeApplicationEngine, transitionApplication } from '@autoapply/application-engine';
import { env } from '@autoapply/config';
import { GreenhouseAdapter } from './adapters/GreenhouseAdapter';
import { getCheckpoint, createOrUpdateCheckpoint, incrementRetryCount, ExecutionState } from './checkpoint/index';
import { classifyError, ApplicationExecutionError, ErrorCategory } from './errors/index';
import { LeverAdapter } from './adapters/LeverAdapter';
import { GenericFallbackAdapter } from './adapters/GenericFallbackAdapter';
import { WorkdayAdapter } from './adapters/WorkdayAdapter';
import { DarwinboxAdapter } from './adapters/DarwinboxAdapter';
import { reconcileCheckpoint, RecoveryAction, checkIdempotency } from './recovery/index';

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

    const checkpoint = await getCheckpoint(applicationId);

    // Enforce Retry Policy Authority
    const maxRetries = RETRY_POLICIES.DEFAULT.attempts;
    if (checkpoint && checkpoint.retryCount >= maxRetries) {
      console.log(`[ApplicationWorker] Execution for application ${applicationId} has exhausted retries (${checkpoint.retryCount}/${maxRetries}).`);
      await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: 'Retry Exhausted', classification: ErrorCategory.UNKNOWN_FATAL_ERROR });
      await recordDeadLetter({
        jobId: job.id!,
        queueName: QUEUE_NAMES.APPLICATION,
        error: 'Retry Exhausted',
        attemptCount: job.attemptsMade,
        stackTrace: null,
      });
      return;
    }

    if (checkpoint && checkpoint.hasSubmitted) {
        await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: checkpoint.submissionEvidence });
        return;
    }

    const tempResumePath = await downloadResumeFromS3(applicationId, fileUrl);
    const browser = await chromium.launch({ headless: env.PLAYWRIGHT_HEADLESS });
    let page;
    try {
      page = await browser.newPage();

      console.log(`[ApplicationWorker] execution_started for application ${applicationId}`);
      await createOrUpdateCheckpoint({
         applicationId,
         lastAction: ExecutionState.STARTING
      }, true);

      // Attempt checkpoint recovery logic if applicable
      if (checkpoint && checkpoint.currentUrl) {
         try {
             await page.goto(checkpoint.currentUrl, { waitUntil: 'networkidle' });
         } catch(e) {
             console.log(`Failed to resume from checkpoint URL, starting from scratch: ${e}`);
             await page.goto(application.job.url, { waitUntil: 'networkidle' });
         }
      } else {
         await page.goto(application.job.url, { waitUntil: 'networkidle' });
      }

      // Reconcile and handle RecoveryAction
      if (checkpoint) {
         console.log(`[ApplicationWorker] recovery_started for application ${applicationId}`);
         const decision = await reconcileCheckpoint(page, checkpoint, application.job.url, adapter);
         console.log(`[ApplicationWorker] checkpoint_reconciled for application ${applicationId} -> ${decision.action}`);

         if (decision.action === RecoveryAction.ALREADY_SUBMITTED) {
            await createOrUpdateCheckpoint({ applicationId, hasSubmitted: true, submissionEvidence: { reason: decision.reason } });
            await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: { reason: decision.reason } });
            await verificationQueue.add('verify-application', { applicationId: application.id }, { attempts: RETRY_POLICIES.DEFAULT.attempts, backoff: RETRY_POLICIES.DEFAULT.backoff });
            return;
         } else if (decision.action === RecoveryAction.RESTART_FROM_SCRATCH && checkpoint.currentUrl && page.url() !== application.job.url) {
            await page.goto(application.job.url, { waitUntil: 'networkidle' });
         }
      } else {
         if (await checkIdempotency(page)) {
            await createOrUpdateCheckpoint({ applicationId, hasSubmitted: true, submissionEvidence: { reason: 'Already applied (detected on load)' } });
            await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: { reason: 'Already applied (detected on load)' } });
            await verificationQueue.add('verify-application', { applicationId: application.id }, { attempts: RETRY_POLICIES.DEFAULT.attempts, backoff: RETRY_POLICIES.DEFAULT.backoff });
            return;
         }
      }

      await createOrUpdateCheckpoint({
         applicationId,
         adapter: adapter.constructor.name,
         currentUrl: page.url(),
         lastAction: ExecutionState.INSPECTING
      });

      await adapter.inspect(page, page.url());

      await createOrUpdateCheckpoint({
         applicationId,
         lastAction: ExecutionState.FILLING
      });

      const outcome = await adapter.fill(page, application.candidate, tempResumePath);

      await createOrUpdateCheckpoint({
         applicationId,
         currentUrl: page.url(),
         currentOutcome: outcome,
         lastAction: outcome.type === 'READY_TO_SUBMIT' ? ExecutionState.READY_TO_SUBMIT :
                     (outcome.type === 'HUMAN_VERIFICATION_REQUIRED' ? ExecutionState.WAITING_FOR_HUMAN : undefined)
      });

      if (outcome.type === 'FAILED') {
        throw new ApplicationExecutionError(`Adapter failed: ${outcome.reason}`, classifyError(`invalid`));
      }

      if (outcome.type === 'BLOCKED_REQUIRED_FIELD') {
        throw new ApplicationExecutionError(`UNKNOWN_REQUIRED_FIELD: ${outcome.fields.join(', ')}`, classifyError(`unknown_required_field`));
      }

      if (outcome.type === 'HUMAN_VERIFICATION_REQUIRED') {
         throw new ApplicationExecutionError(`HUMAN_VERIFICATION_REQUIRED: ${outcome.reason}`, classifyError(`human`));
      }

      if (outcome.type === 'SUBMITTED') {
         await createOrUpdateCheckpoint({
             applicationId,
             hasSubmitted: true,
             submissionEvidence: outcome.evidence,
             lastAction: ExecutionState.COMPLETED
         });
         await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: outcome.evidence });
         await verificationQueue.add('verify-application', { applicationId: application.id }, {
           attempts: RETRY_POLICIES.DEFAULT.attempts,
           backoff: RETRY_POLICIES.DEFAULT.backoff,
         });
         return;
      }

      // Submission Boundary
      if (outcome.type !== 'READY_TO_SUBMIT' || !outcome.submitLocator) {
         throw new ApplicationExecutionError('MISSING_SUBMIT_LOCATOR', classifyError('missing_submit_locator'));
      }

      // Re-verify idempotency right before click
      if (await checkIdempotency(page)) {
          await createOrUpdateCheckpoint({ applicationId, hasSubmitted: true, submissionEvidence: { reason: 'Already applied (detected before submit)' } });
          await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: { reason: 'Already applied (detected before submit)' } });
          await verificationQueue.add('verify-application', { applicationId: application.id }, { attempts: RETRY_POLICIES.DEFAULT.attempts, backoff: RETRY_POLICIES.DEFAULT.backoff });
          return;
      }

      console.log(`[ApplicationWorker] submission_started for application ${applicationId}`);
      await createOrUpdateCheckpoint({ applicationId, lastAction: ExecutionState.SUBMITTING });

      let submitted;
      try {
        submitted = await adapter.submit(page, outcome.submitLocator);
      } catch (submitErr) {
        console.log(`[ApplicationWorker] submission error for application ${applicationId}: ${submitErr}. Verifying submission state.`);
        await createOrUpdateCheckpoint({ applicationId, lastAction: ExecutionState.VERIFYING_SUBMISSION });

        // Let's pause and check if the submission actually succeeded before propagating error.
        await new Promise(r => setTimeout(r, 2000));
        if (await checkIdempotency(page)) {
           console.log(`[ApplicationWorker] submission_ambiguous but recovered via idempotency for application ${applicationId}`);
           await createOrUpdateCheckpoint({ applicationId, hasSubmitted: true, submissionEvidence: { reason: 'Already applied (detected after submission error)' } });
           await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: { reason: 'Already applied (detected after submission error)' } });
           await verificationQueue.add('verify-application', { applicationId: application.id }, { attempts: RETRY_POLICIES.DEFAULT.attempts, backoff: RETRY_POLICIES.DEFAULT.backoff });
           return;
        }

        throw submitErr;
      }

      if (!submitted.confirmed) {
        throw new ApplicationExecutionError('SUBMISSION_NOT_CONFIRMED', classifyError('submission_not_confirmed'));
      }

      console.log(`[ApplicationWorker] submission_confirmed for application ${applicationId}`);
      await createOrUpdateCheckpoint({
         applicationId,
         hasSubmitted: true,
         submissionEvidence: submitted.evidence,
         lastAction: ExecutionState.COMPLETED
      });

      await transitionApplication(application.id, 'SUBMITTED', { submissionEvidence: submitted.evidence });
      await verificationQueue.add('verify-application', { applicationId: application.id }, {
        attempts: RETRY_POLICIES.DEFAULT.attempts,
        backoff: RETRY_POLICIES.DEFAULT.backoff,
      });
    } catch (error) {
      const classification = classifyError(error);
      const message = error instanceof Error ? error.message : String(error);

      if (classification.needsHuman) {
        console.log(`[ApplicationWorker] human_handoff requested for application ${applicationId}: ${message}`);
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
      }

      // If it's not a human verification error, let's look at other classifications
      if (classification.terminal) {
          // Terminal error, we don't throw to retry, we just fail it to NEEDS_HUMAN or FAILED
          console.log(`[ApplicationWorker] execution_failed (terminal) for application ${applicationId}: ${message}`);
          await transitionApplication(application.id, 'NEEDS_HUMAN', { reason: message, classification: classification.category });
          return;
      }

      // For retryable transient errors, throw so BullMQ handles retry
      if (classification.retryable) {
          console.log(`[ApplicationWorker] retry_scheduled for application ${applicationId}: ${message}`);
          await incrementRetryCount(applicationId);
          throw error;
      }

      console.log(`[ApplicationWorker] execution_failed (unknown) for application ${applicationId}: ${message}`);
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
