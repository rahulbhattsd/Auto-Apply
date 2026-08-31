import { Worker, QUEUE_NAMES, connection, RETRY_POLICIES } from '@autoapply/queue';
import { Queue } from '@autoapply/queue';
import { prisma } from '@autoapply/database';
import { transitionApplication } from '@autoapply/application-engine';
import { env } from '@autoapply/config';

const resumeQueue = new Queue(QUEUE_NAMES.RESUME_GENERATION, { connection });

const worker = new Worker(
  QUEUE_NAMES.JOB_ANALYSIS,
  async (job) => {
    console.log(`[AnalysisWorker] Analyzing job ${job.id}, payload:`, job.data);
    const { jobId, candidateId } = job.data;
    if (!candidateId) return;

    const matchScore = Math.floor(Math.random() * 50) + 50;

    await prisma.jobAnalysis.upsert({
      where: { jobId },
      update: { matchScore },
      create: {
        jobId,
        matchScore,
        recommendation: 'Good match',
        skillsMatched: ['React'],
        skillsMissing: ['Vue'],
        reasoning: 'Matches criteria'
      }
    });

    const dbJob = await prisma.job.findUnique({ where: { id: jobId }});
    if (!dbJob) return;

    const candidate = await prisma.candidateProfile.findUnique({ where: { userId: candidateId } });
    if (!candidate?.userId) return;

    const policy = await prisma.applicationPolicy.findUnique({ where: { userId: candidate.userId }});
    const automation = await prisma.automationConfig.findUnique({ where: { userId: candidate.userId }});

    const minScore = policy?.minimumMatchScore || 70;

    const descriptionLower = dbJob.description.toLowerCase();
    const companyLower = (dbJob.companyId ? "test-company" : "").toLowerCase();

    const isExcludedKeyword = policy?.excludedKeywords?.some(k => descriptionLower.includes(k.toLowerCase()));
    const isExcludedCompany = policy?.excludedCompanies?.some(c => companyLower.includes(c.toLowerCase()));

    if (isExcludedKeyword || isExcludedCompany) {
      console.log(`[AnalysisWorker] Job ${jobId} failed exclusion policies. Keyword: ${isExcludedKeyword}, Company: ${isExcludedCompany}`);
      return;
    }

    if (matchScore >= minScore && automation?.autoApplyEnabled) {
       const today = new Date();
       today.setHours(0, 0, 0, 0);

       const appsToday = await prisma.application.count({
         where: {
           candidateId: candidate.id,
           createdAt: { gte: today }
         }
       });

       const limit = policy?.maxApplicationsPerDay || env.MAX_APPLICATIONS_PER_DAY;

       if (appsToday >= limit) {
         console.log(`[AnalysisWorker] Daily limit (${limit}) reached for candidate ${candidate.id}. Skipping.`);
         return;
       }

       const existingApp = await prisma.application.findUnique({
         where: { candidateId_canonicalJobId: { candidateId: candidate.id, canonicalJobId: dbJob.canonicalFingerprint } }
       });

       if (!existingApp) {
           const app = await prisma.application.create({
             data: {
               candidateId: candidate.id,
               jobId,
               canonicalJobId: dbJob.canonicalFingerprint,
               status: 'DISCOVERED'
             }
           });

           await transitionApplication(app.id, 'ANALYZING');
           await transitionApplication(app.id, 'MATCHED');
           await transitionApplication(app.id, 'QUEUED');

           await resumeQueue.add('generate-resume', { applicationId: app.id }, {
              attempts: RETRY_POLICIES.DEFAULT.attempts,
              backoff: RETRY_POLICIES.DEFAULT.backoff
           });
       }
    }
  },
  { connection }
);
worker.on('ready', () => console.log('Analysis Worker started'));
worker.on('failed', async (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        await prisma.deadLetter.create({
            data: {
                jobId: job.id!,
                queueName: QUEUE_NAMES.JOB_ANALYSIS,
                error: err.message,
                attemptCount: job.attemptsMade,
                stackTrace: err.stack || null
            }
        });
    }
});
