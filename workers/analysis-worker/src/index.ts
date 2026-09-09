import { Worker, QUEUE_NAMES, connection, RETRY_POLICIES, DEFAULT_JOB_OPTIONS } from '@autoapply/queue';
import { Queue } from '@autoapply/queue';
import { prisma, recordDeadLetter } from '@autoapply/database';
import { closeApplicationEngine, createEligibleApplication, transitionApplication } from '@autoapply/application-engine';
import { AnalysisPipeline, GroqProvider } from '@autoapply/ai-analysis';

const resumeQueue = new Queue(QUEUE_NAMES.RESUME_GENERATION, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
const analysisPipeline = new AnalysisPipeline(new GroqProvider());

const worker = new Worker(
  QUEUE_NAMES.JOB_ANALYSIS,
  async (job) => {
    console.log(`[AnalysisWorker] Analyzing job ${job.id}, payload:`, job.data);
    const { jobId, candidateId } = job.data;
    if (!candidateId) return;

    const candidate = await prisma.candidateProfile.findUnique({ where: { id: candidateId } });
    if (!candidate) return;

    const analysis = await analysisPipeline.processJob(jobId, candidate.id);
    const policy = await prisma.applicationPolicy.findUnique({ where: { userId: candidate.userId }});
    const automation = await prisma.automationConfig.findUnique({ where: { userId: candidate.userId }});

    const minScore = policy?.minimumMatchScore || 70;

    if (analysis.recommendation === 'REJECT') {
      return;
    }

    const result = await createEligibleApplication({
      jobId,
      candidateId: candidate.id,
      minimumMatchScore: minScore,
      matchScore: analysis.matchScore,
    });

    if (result.created && automation?.autoApplyEnabled) {
      await transitionApplication(result.application.id, 'ANALYZING');
      await transitionApplication(result.application.id, 'MATCHED');
      await transitionApplication(result.application.id, 'QUEUED');

      await resumeQueue.add('generate-resume', { applicationId: result.application.id }, {
        attempts: RETRY_POLICIES.DEFAULT.attempts,
        backoff: RETRY_POLICIES.DEFAULT.backoff
      });
    }
  },
  { connection }
);
worker.on('ready', () => console.log('Analysis Worker started'));
worker.on('failed', async (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        await recordDeadLetter({
          jobId: job.id!,
          queueName: QUEUE_NAMES.JOB_ANALYSIS,
          error: err.message,
          attemptCount: job.attemptsMade,
          stackTrace: err.stack || null,
        });
    }
});

const shutdown = async () => {
    await worker.close();
    await resumeQueue.close();
    await closeApplicationEngine();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
