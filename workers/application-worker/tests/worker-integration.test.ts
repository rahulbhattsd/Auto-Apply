import test from 'node:test';
import assert from 'node:assert';
import fastify from 'fastify';
import { prisma } from '@autoapply/database';
import { getCheckpoint, createOrUpdateCheckpoint, ExecutionState } from '../src/checkpoint/index';
import { Queue, QUEUE_NAMES, connection } from '@autoapply/queue';
import { env } from '@autoapply/config';

import { FormCompletionEngine } from '@autoapply/ai-analysis';
import * as s3utils from '../src/utils/s3';
import fs from 'fs';

// This test requires real backing services: Postgres, Redis, and Playwright Chromium.
if (process.env.RUN_WORKER_INTEGRATION !== '1') {
  console.log('Worker integration tests: SKIPPED\nReason: RUN_WORKER_INTEGRATION=1 is not set. PostgreSQL/Redis infrastructure unavailable.');
  process.exit(0);
}

// Mocking strictly external non-deterministic APIs
s3utils.downloadResumeFromS3 = async (applicationId, fileUrl) => {
   const path = `/tmp/resume-${applicationId}.pdf`;
   fs.writeFileSync(path, 'fake resume content');
   return path;
};

let fakeOutcome = { type: 'READY_TO_SUBMIT', submitLocator: 'button[type="submit"]' };
FormCompletionEngine.prototype.processPage = async function(page: any, candidate: any, resumePath: string) {
    return fakeOutcome as any;
};

test('Worker-Level Integration: E2E Workload', async (t) => {
    // Import worker after environment guard so we don't crash on connection setup
    const { worker } = require('../src/index');

    const server = fastify();
    let submitAttempts = 0;
    let failSubmit = false;
    let captchaMode = false;
    let requiredFieldMode = false;

    server.get('/apply', async (request, reply) => {
        if (captchaMode) {
             reply.type('text/html').send(`<html><body><iframe src="cloudflare-challenge"></iframe></body></html>`);
             return;
        }

        if (requiredFieldMode) {
             reply.type('text/html').send(`
                <html>
                    <body>
                        <form method="POST" action="/submit" id="apply-form">
                            <input type="text" name="ssn" required />
                            <button type="submit" id="submit-btn">Submit Application</button>
                        </form>
                    </body>
                </html>
            `);
            return;
        }

        reply.type('text/html').send(`
            <html>
                <body>
                    <form method="POST" action="/submit" id="apply-form">
                        <input type="text" name="first_name" required />
                        <button type="submit" id="submit-btn">Submit Application</button>
                    </form>
                </body>
            </html>
        `);
    });

    server.post('/submit', async (request, reply) => {
        submitAttempts++;
        if (failSubmit) {
            return reply.status(500).send('Internal Server Error');
        }
        reply.redirect('/confirmation');
    });

    server.get('/confirmation', async (request, reply) => {
         reply.type('text/html').send(`<html><body><h1>Thank you for applying</h1></body></html>`);
    });

    const address = await server.listen({ port: 0 });
    const baseUrl = `http://localhost:${(server.server.address() as any).port}`;

    const applicationId = 9999;

    // DB setup
    await prisma.application.deleteMany({ where: { id: applicationId } });
    await prisma.user.deleteMany({ where: { id: 9999 } });
    await prisma.candidate.deleteMany({ where: { userId: 9999 } });

    const user = await prisma.user.create({ data: { id: 9999, email: 'test9999@test.com', firstName: 'T', lastName: 'T' } });
    const candidate = await prisma.candidate.create({ data: { userId: user.id } });
    const job = await prisma.job.create({ data: { title: 'Test', company: 'TestCo', url: `${baseUrl}/apply`, canonicalJobId: 'test-job-9999' } });

    const app = await prisma.application.create({
        data: {
            id: applicationId,
            candidateId: candidate.id,
            jobId: job.id,
            status: 'APPLYING'
        }
    });

    await prisma.resumeVersion.create({
        data: {
            applicationId,
            version: 1,
            basedOnMasterResume: {
                create: {
                   candidateId: candidate.id,
                   fileUrl: 's3://fake-resume.pdf',
                   parsedContent: {}
                }
            }
        }
    });

    const applicationQueue = new Queue(QUEUE_NAMES.APPLICATION, { connection });

    await t.test('Scenario A: Normal Execution', async () => {
         submitAttempts = 0;
         fakeOutcome = { type: 'READY_TO_SUBMIT', submitLocator: 'button[type="submit"]' };

         const testJob = await applicationQueue.add('apply', { applicationId });
         await testJob.waitUntilFinished(applicationQueue.events);

         const finalApp = await prisma.application.findUnique({ where: { id: applicationId }});
         assert.strictEqual(finalApp?.status, 'SUBMITTED');
         assert.strictEqual(submitAttempts, 1);

         const cp = await getCheckpoint(applicationId);
         assert.strictEqual(cp?.hasSubmitted, true);
    });

    await server.close();
    await worker.close();
    await applicationQueue.close();
    await connection.quit();
    await prisma.$disconnect();
});
