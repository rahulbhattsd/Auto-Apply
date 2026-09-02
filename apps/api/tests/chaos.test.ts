import { test } from 'node:test';
import assert from 'node:assert';
import { Worker, Queue, QUEUE_NAMES, connection } from '@autoapply/queue';
import { prisma } from '@autoapply/database';
import { Job } from 'bullmq';
test('Chaos Testing - Worker Crash Recovery', async (t) => {
    const queue = new Queue(QUEUE_NAMES.APPLICATION, { connection });
    await prisma.deadLetter.deleteMany({});
    const job = await queue.add('test-crash-job', { data: 'test payload' }, { attempts: 1 });
    let failedEventFired = false;
    let promiseResolve: () => void;
    const testDonePromise = new Promise<void>(resolve => { promiseResolve = resolve; });
    const worker = new Worker(QUEUE_NAMES.APPLICATION, async (j: Job) => {
        if (j.name === 'test-crash-job') { throw new Error('Simulated worker crash'); }
    }, { connection });
    worker.on('failed', async (failedJob, err) => {
        if (failedJob && failedJob.id === job.id) {
             failedEventFired = true;
             await prisma.deadLetter.create({
                 data: { jobId: failedJob.id, queueName: QUEUE_NAMES.APPLICATION, error: err.message, attemptCount: failedJob.attemptsMade || 1, stackTrace: err.stack || null }
             });
             promiseResolve();
        }
    });
    await testDonePromise;
    assert.strictEqual(failedEventFired, true, 'Failed event should have fired on the worker');
    const deadLetter = await prisma.deadLetter.findFirst({ where: { jobId: job.id } });
    assert.ok(deadLetter, 'Dead letter should be recorded in DB for the failed job');
    assert.strictEqual(deadLetter.error, 'Simulated worker crash');
    await worker.close();
    await queue.close();
    connection.disconnect();
});
