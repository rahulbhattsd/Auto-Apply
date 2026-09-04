import { Worker, QUEUE_NAMES, connection, Queue } from '@autoapply/queue';
import { closeApplicationEngine, transitionApplication } from '@autoapply/application-engine';
import { prisma } from '@autoapply/database';
import { GroqProvider } from '@autoapply/ai-analysis';

const aiProvider = new GroqProvider();
const applicationQueue = new Queue(QUEUE_NAMES.APPLICATION, { connection });

const worker = new Worker(
  QUEUE_NAMES.RESUME_GENERATION,
  async (job) => {
    console.log(`[ResumeWorker] Processing job ${job.id}`);
    const { applicationId } = job.data;

    // Fetch required data
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: true,
        job: true,
      }
    });

    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    if (application.status === 'QUEUED') {
      await transitionApplication(applicationId, 'RESUME_GENERATING');
    }

    const candidateProfile = application.candidate;
    const jobData = application.job;

    // Prefer CandidateProfile's already-structured fields
    const candidateData = {
      skills: (candidateProfile.skills as string[]) || [],
      experience: (candidateProfile.experience as Record<string, unknown>[]) || [],
      education: (candidateProfile.education as Record<string, unknown>[]) || [],
      preferredRoles: candidateProfile.preferredRoles || [],
      preferredLocations: candidateProfile.preferredLocations || [],
    };

    const aiJobData = {
      title: jobData.title,
      company: 'Unknown',
      description: jobData.description,
      location: jobData.location,
      remoteType: jobData.remoteType,
      skills: jobData.skills || [],
    };

    if (jobData.companyId) {
       const company = await prisma.company.findUnique({where: {id: jobData.companyId}});
       if (company) {
           aiJobData.company = company.name;
       }
    }

    // Call AI Generation and Hallucination Validation
    let tailoredResume;
    let coverLetter;

    try {
      tailoredResume = await aiProvider.tailorResume({ candidate: candidateData, job: aiJobData });

      // Hallucination validation - skills
      const generatedSkills = (tailoredResume.content["skills"] as string[]) || [];
      const originalSkills = new Set(candidateData.skills.map(s => s.toLowerCase()));
      const hallucinatedSkills = generatedSkills.filter(s => !originalSkills.has(s.toLowerCase()));

      if (hallucinatedSkills.length > 0) {
        throw new Error(`Hallucination detected. Invented skills: ${hallucinatedSkills.join(', ')}`);
      }

      // Hallucination validation - companies
      const generatedExperience = (tailoredResume.content["experience"] as Record<string, unknown>[]) || [];
      const originalCompanies = new Set(candidateData.experience.map(e => e["company"]?.toString().toLowerCase()));
      const hallucinatedCompanies = generatedExperience.map(e => e["company"] as string).filter(c => c && !originalCompanies.has(c.toLowerCase()));

      if (hallucinatedCompanies.length > 0) {
        throw new Error(`Hallucination detected. Invented companies: ${hallucinatedCompanies.join(', ')}`);
      }

      // Hallucination validation - education
      const generatedEducation = (tailoredResume.content["education"] as Record<string, unknown>[]) || [];
      const originalInstitutions = new Set(candidateData.education.map(e => e["institution"]?.toString().toLowerCase()));
      const hallucinatedInstitutions = generatedEducation.map(e => e["institution"] as string).filter(i => i && !originalInstitutions.has(i.toLowerCase()));

      if (hallucinatedInstitutions.length > 0) {
        throw new Error(`Hallucination detected. Invented institutions: ${hallucinatedInstitutions.join(', ')}`);
      }

      coverLetter = await aiProvider.generateCoverLetter({ candidate: candidateData, job: aiJobData });
    } catch (error) {
      console.error(`[ResumeWorker] Generation failed for application ${applicationId}:`, error);
      throw error;
    }

    // Fetch master resume to link
    const masterResume = await prisma.resume.findFirst({
      where: { userId: candidateProfile.userId, isMaster: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!masterResume) {
        throw new Error(`Master resume not found for user ${candidateProfile.userId}`);
    }

    // Determine next version
    const lastVersion = await prisma.resumeVersion.findFirst({
        where: { applicationId },
        orderBy: { version: 'desc' }
    });
    const nextVersion = lastVersion ? lastVersion.version + 1 : 1;

    // Persist
    await prisma.resumeVersion.create({
      data: {
        candidateId: candidateProfile.id,
        jobId: jobData.id,
        applicationId,
        basedOnMasterResumeId: masterResume.id,
        version: nextVersion,
        content: tailoredResume.content as import("@prisma/client").Prisma.InputJsonValue,
        coverLetter,
      }
    });

    // Transition state
    await transitionApplication(applicationId, 'READY_TO_APPLY', {
      version: nextVersion
    });

    await applicationQueue.add('submit-application', { applicationId });

    console.log(`[ResumeWorker] Application ${applicationId} transitioned to READY_TO_APPLY with tailored resume version ${nextVersion}.`);
  },
  { connection }
);

worker.on('failed', async (job, err) => {
  if (job) {
    console.error(`[ResumeWorker] Job ${job.id} failed: ${err.message}`);
    const applicationId = job.data.applicationId;

    if (job.attemptsMade >= (job.opts.attempts || 1)) {
        try {
            await transitionApplication(applicationId, 'FAILED', {
                error: err.message,
                stackTrace: err.stack,
                step: 'RESUME_GENERATION_FAILED'
            });
        } catch (tErr) {
            console.error(`[ResumeWorker] Failed to transition application ${applicationId} to FAILED:`, tErr);
        }

        await prisma.deadLetter.create({
            data: {
                jobId: job.id!,
                queueName: QUEUE_NAMES.RESUME_GENERATION,
                error: err.message,
                attemptCount: job.attemptsMade,
                stackTrace: err.stack || null
            }
        });
    }
  }
});

worker.on('ready', () => console.log('Resume Worker started'));

const shutdown = async () => {
  await worker.close();
  await applicationQueue.close();
  await closeApplicationEngine();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
