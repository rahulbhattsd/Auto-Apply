import { Worker, QUEUE_NAMES, connection, RETRY_POLICIES } from '@autoapply/queue';
import { Queue } from '@autoapply/queue';
import { prisma, recordDeadLetter } from '@autoapply/database';
import { loadConfiguredJobSources, NormalizationService } from '@autoapply/job-discovery';

const analysisQueue = new Queue(QUEUE_NAMES.JOB_ANALYSIS, { connection });
const normalization = new NormalizationService();

const worker = new Worker(
  QUEUE_NAMES.JOB_DISCOVERY,
  async (job) => {
    console.log(`[DiscoveryWorker] Processing job ${job.id}`);
    const userId = Number(job.data?.userId);
    if (!userId) throw new Error('Discovery job requires userId');

    const profile = await prisma.candidateProfile.findUnique({
      where: { userId },
      include: { user: { include: { policy: true } } },
    });
    if (!profile) throw new Error(`Candidate profile missing for user ${userId}`);

    const sources = await loadConfiguredJobSources();
    if (sources.length === 0) {
      throw new Error('No real job discovery sources are configured');
    }

    let discovered = 0;
    for (const source of sources) {
      try {
        const roles = profile.user.policy?.targetRoles.length ? profile.user.policy.targetRoles : profile.preferredRoles;
        const locations = profile.preferredLocations.length ? profile.preferredLocations : [undefined];
        for (const role of roles.length ? roles : [undefined]) {
          for (const location of locations) {
            const rawJobs = await source.searchJobs({ title: role, location, limit: 25 });
            for (const rawJob of rawJobs) {
              const normalizedJob = await normalization.normalizeAndPersist(rawJob, source);
              discovered += 1;
              await analysisQueue.add(
                'analyze-job',
                { jobId: normalizedJob.id, candidateId: profile.id },
                {
                  jobId: `analysis-${profile.id}-${normalizedJob.id}`,
                  attempts: RETRY_POLICIES.AI_ERROR.attempts,
                  backoff: RETRY_POLICIES.AI_ERROR.backoff,
                }
              );
            }
          }
        }
      } catch (error) {
        console.error(`[DiscoveryWorker] Source ${source.name} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`[DiscoveryWorker] Discovered ${discovered} jobs and queued analysis for user ${userId}.`);
  },
  { connection }
);

worker.on('failed', async (job, err) => {
  console.error(`[DiscoveryWorker] Job ${job?.id} failed with ${err.message}`);
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        await recordDeadLetter({
          jobId: job.id!,
          queueName: QUEUE_NAMES.JOB_DISCOVERY,
          error: err.message,
          attemptCount: job.attemptsMade,
          stackTrace: err.stack || null,
        });
    }
});
worker.on('ready', () => console.log('Discovery Worker started'));

const shutdown = async () => {
  await worker.close();
  await analysisQueue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
