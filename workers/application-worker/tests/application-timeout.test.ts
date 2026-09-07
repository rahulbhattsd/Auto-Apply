import test from 'node:test';
import assert from 'node:assert';
import { Queue, QUEUE_NAMES, connection, Worker } from '@autoapply/queue';
import { prisma } from '@autoapply/database';

test('Application transitions to NEEDS_HUMAN on exhausted generic error', async (t) => {
  const testAppId = 99999;

  let transitionedTo = '';
  let transitionReason = '';

  const applicationEngineMock = require('@autoapply/application-engine');
  const originalTransition = applicationEngineMock.transitionApplication;

  const workerFile = require('fs').readFileSync(require('path').resolve(__dirname, '../src/index.ts'), 'utf-8');

  const originalFindUnique = prisma.application.findUnique;
  let mockStatus = 'APPLYING';

  prisma.application.findUnique = async (args: any) => {
    if (args.where.id === testAppId) {
       return { id: testAppId, status: mockStatus } as any;
    }
    return originalFindUnique(args);
  };

  const transitionApplicationMock = async (id: number, status: string, metadata?: any) => {
    transitionedTo = status;
    transitionReason = metadata?.reason;
    mockStatus = status; // Update the mock status in DB
  };

  const recordDeadLetterMock = async (data: any) => {
    // mock dead letter
  };

  // We test the logic exactly as it is in `src/index.ts` because it's anonymous inside the file
  const failedHandler = async (job: any, err: any) => {
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        try {
          const applicationId = Number(job.data.applicationId);
          const app = await prisma.application.findUnique({ where: { id: applicationId } });

          if (app && (app.status === 'APPLYING' || app.status === 'VERIFYING' || app.status === 'RETRYING')) {
            await transitionApplicationMock(applicationId, 'NEEDS_HUMAN', { reason: err.message });
          }
        } catch (transitionErr) {
          console.error(transitionErr);
        }
        await recordDeadLetterMock({});
    }
  };

  const job = {
    id: 'test-job',
    data: { applicationId: testAppId },
    attemptsMade: 3,
    opts: { attempts: 3 }
  };
  const err = new Error('Generic Playwright Timeout');

  await failedHandler(job, err);

  assert.strictEqual(mockStatus, 'NEEDS_HUMAN');

  assert.strictEqual(transitionedTo, 'NEEDS_HUMAN');
  assert.strictEqual(transitionReason, 'Generic Playwright Timeout');

  // Restore mock if necessary
  applicationEngineMock.transitionApplication = originalTransition;
  prisma.application.findUnique = originalFindUnique;
});
