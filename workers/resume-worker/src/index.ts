import { Worker, QUEUE_NAMES, connection, Queue, RETRY_POLICIES, DEFAULT_JOB_OPTIONS } from '@autoapply/queue';
import { closeApplicationEngine, transitionApplication } from '@autoapply/application-engine';
import { prisma, recordDeadLetter } from '@autoapply/database';
import { GroqProvider, MockAIProvider, ResumePdfCompiler } from '@autoapply/ai-analysis';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@autoapply/config';

const isMockAi = process.env['AI_PROVIDER'] === 'mock' || !env.GROQ_API_KEY || env.GROQ_API_KEY.startsWith('gsk_mock_') || env.NODE_ENV === 'test';
const aiProvider = isMockAi ? new MockAIProvider() : new GroqProvider();
const applicationQueue = new Queue(QUEUE_NAMES.APPLICATION, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });

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
    } else if (application.status !== 'RESUME_GENERATING') {
      throw new Error(`Application ${applicationId} is not in a valid state for resume generation; current status is ${application.status}`);
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

    // Compile tailored PDF
    let tailoredPdfKey: string | undefined;
    try {
      const user = await prisma.user.findUnique({ where: { id: candidateProfile.userId } });
      const resumeHtml = ResumePdfCompiler.generateHtml({
        name: candidateProfile.name,
        email: user?.email,
        phone: candidateProfile.phone,
        location: candidateProfile.location,
        linkedin: candidateProfile.linkedin,
        github: candidateProfile.github,
        portfolio: candidateProfile.portfolio,
        summary: `Targeting fresher / junior role at ${aiJobData.company || 'the organization'}. Motivated problem solver with strong foundation in core computer science principles, software development, and modern development stacks.`,
        skills: (tailoredResume.content['skills'] as string[]) || candidateData.skills,
        experience: candidateData.experience as any,
        education: candidateData.education as any,
        projects: (candidateProfile.projects as any) || [],
      });

      const pdfBuffer = await ResumePdfCompiler.compilePdf(resumeHtml);

      if (env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
        const s3 = new S3Client({
          endpoint: env.S3_ENDPOINT,
          region: 'auto',
          forcePathStyle: true,
          credentials: {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          },
        });
        tailoredPdfKey = `tailored-resumes/${candidateProfile.userId}/app-${applicationId}-v${nextVersion}.pdf`;
        await s3.send(new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: tailoredPdfKey,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        }));
        console.log(`[ResumeWorker] Successfully compiled and uploaded tailored PDF to S3: ${tailoredPdfKey}`);
      }
    } catch (pdfErr) {
      console.warn(`[ResumeWorker] Could not compile or upload tailored PDF (falling back to master):`, pdfErr);
    }

    // Persist
    await prisma.resumeVersion.create({
      data: {
        candidateId: candidateProfile.id,
        jobId: jobData.id,
        applicationId,
        basedOnMasterResumeId: masterResume.id,
        version: nextVersion,
        content: {
          ...tailoredResume.content,
          ...(tailoredPdfKey ? { tailoredPdfKey } : {}),
        } as import("@prisma/client").Prisma.InputJsonValue,
        coverLetter,
      }
    });

    // Transition state
    await transitionApplication(applicationId, 'READY_TO_APPLY', {
      version: nextVersion
    });

    await applicationQueue.add('submit-application', { applicationId }, {
      attempts: RETRY_POLICIES.BROWSER_ERROR.attempts,
      backoff: RETRY_POLICIES.BROWSER_ERROR.backoff,
    });

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

        await recordDeadLetter({
          jobId: job.id!,
          queueName: QUEUE_NAMES.RESUME_GENERATION,
          error: err.message,
          attemptCount: job.attemptsMade,
          stackTrace: err.stack || null,
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
