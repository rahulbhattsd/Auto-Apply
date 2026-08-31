import { Worker, QUEUE_NAMES, connection } from '@autoapply/queue';
import { Queue } from '@autoapply/queue';
import { prisma } from '@autoapply/database';

const analysisQueue = new Queue(QUEUE_NAMES.JOB_ANALYSIS, { connection });

const worker = new Worker(
  QUEUE_NAMES.JOB_DISCOVERY,
  async (job) => {
    console.log(`[DiscoveryWorker] Processing job ${job.id}`);
    const userId = job.data?.userId || 1;

    const mockJobs = [
      { externalId: `ext-123-${Date.now()}`, sourceId: 1, title: 'Software Engineer', description: 'desc', url: 'http://ex.com', canonicalFingerprint: `fing-1-${Date.now()}`, postedAt: new Date() },
      { externalId: `ext-456-${Date.now()}`, sourceId: 1, title: 'Senior Developer', description: 'desc2', url: 'http://ex.com/2', canonicalFingerprint: `fing-2-${Date.now()}`, postedAt: new Date() }
    ];

    for (const j of mockJobs) {
      await prisma.job.upsert({
        where: { canonicalFingerprint: j.canonicalFingerprint },
        update: {},
        create: { ...j }
      });

      const dbJob = await prisma.job.findUnique({ where: { canonicalFingerprint: j.canonicalFingerprint }});
      if (dbJob) {
        await analysisQueue.add('analyze-job', { jobId: dbJob.id, candidateId: userId });
      }
    }

    console.log(`[DiscoveryWorker] Discovered ${mockJobs.length} jobs and queued for analysis for user ${userId}.`);
  },
  { connection }
);

worker.on('failed', async (job, err) => {
  console.error(`[DiscoveryWorker] Job ${job?.id} failed with ${err.message}`);
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        await prisma.deadLetter.create({
            data: {
                jobId: job.id!,
                queueName: QUEUE_NAMES.JOB_DISCOVERY,
                error: err.message,
                attemptCount: job.attemptsMade,
                stackTrace: err.stack || null
            }
        });
    }
});
worker.on('ready', () => console.log('Discovery Worker started'));
