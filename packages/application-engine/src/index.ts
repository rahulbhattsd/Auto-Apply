import { prisma, ApplicationStatus, Prisma } from '@autoapply/database';
import Redis from 'ioredis';
import { env } from '@autoapply/config';

export const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DISCOVERED: ['ANALYZING', 'REJECTED'],
  ANALYZING: ['MATCHED', 'REJECTED', 'FAILED'],
  REJECTED: [],
  MATCHED: ['QUEUED', 'REJECTED'],
  QUEUED: ['RESUME_GENERATING', 'CANCELLED'],
  RESUME_GENERATING: ['READY_TO_APPLY', 'FAILED'],
  READY_TO_APPLY: ['APPLYING', 'CANCELLED'],
  APPLYING: ['SUBMITTED', 'FAILED', 'RETRYING', 'NEEDS_HUMAN', 'AWAITING_HUMAN_VERIFICATION'],
  SUBMITTED: ['VERIFYING'],
  VERIFYING: ['VERIFIED', 'FAILED', 'RETRYING', 'NEEDS_HUMAN'],
  VERIFIED: [],
  FAILED: ['RETRYING', 'CANCELLED'],
  RETRYING: ['APPLYING', 'VERIFYING', 'FAILED'],
  NEEDS_HUMAN: ['APPLYING', 'CANCELLED', 'REJECTED'],
  AWAITING_HUMAN_VERIFICATION: ['APPLYING', 'NEEDS_HUMAN'],
  CANCELLED: [],
};

type NotificationQueue = {
  close(): Promise<void>;
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
};

let notificationQueue: NotificationQueue | undefined;
let publisher: Redis | undefined;

async function getMessagingClients() {
  const { Queue, QUEUE_NAMES, connection, DEFAULT_JOB_OPTIONS } = await import('@autoapply/queue');
  notificationQueue ??= new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  publisher ??= new Redis(env.REDIS_URL);
  return { notificationQueue, publisher };
}

export async function closeApplicationEngine() {
  await notificationQueue?.close();
  publisher?.disconnect();
}

export async function transitionApplication(
  applicationId: number,
  toState: ApplicationStatus,
  metadata?: Record<string, unknown>
) {
  return await prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: {
          include: { user: true }
        },
        job: {
          include: { company: true }
        }
      }
    });

    if (!app) {
      throw new Error(`Application ${applicationId} not found`);
    }

    const currentState = app.status;
    const allowed = VALID_TRANSITIONS[currentState] || [];

    if (!allowed.includes(toState)) {
      throw new Error(
        `Illegal state transition from ${currentState} to ${toState}`
      );
    }

    const updatedApp = await tx.application.update({
      where: { id: applicationId },
      data: { status: toState },
    });

    const event = await tx.applicationEvent.create({
      data: {
        applicationId,
        jobId: app.jobId,
        eventType: toState,
        payload: metadata ? (metadata as never) : {},
      },
    });

    // Notification logic
    const companyName = app.job.company?.name || 'Unknown Company';
    const roleName = app.job.title;
    const messaging = await getMessagingClients();
    const notificationOpts = {
      attempts: 4,
      backoff: { type: 'exponential', delay: 30000 },
    };

    if (toState === 'VERIFIED') {
      await messaging.notificationQueue.add('notify', {
        type: 'VERIFIED',
        recipient: app.candidate.user.email,
        subject: `Application Verified: ${roleName} at ${companyName}`,
        message: `Great news! Your application for ${roleName} at ${companyName} has been successfully submitted and verified.`,
        relatedApplicationId: applicationId,
        metadata,
      }, notificationOpts);
    } else if (toState === 'NEEDS_HUMAN') {
      await messaging.notificationQueue.add('notify', {
        type: 'NEEDS_HUMAN',
        recipient: app.candidate.user.email,
        subject: `Action Required: Application for ${roleName} at ${companyName}`,
        message: `Your application for ${roleName} at ${companyName} requires human intervention (e.g., CAPTCHA or missing info). Please visit the Human Action Center in your dashboard to continue.`,
        relatedApplicationId: applicationId,
        metadata,
      }, notificationOpts);
    } else if (toState === 'AWAITING_HUMAN_VERIFICATION') {
      await messaging.notificationQueue.add('notify', {
        type: 'NEEDS_HUMAN', // Reuse NEEDS_HUMAN path for notification
        recipient: app.candidate.user.email,
        subject: `Live Action Required: Application for ${roleName} at ${companyName}`,
        message: `Your application for ${roleName} at ${companyName} hit a CAPTCHA. Please visit the live view to resolve it now.`,
        relatedApplicationId: applicationId,
        metadata: {
          ...metadata,
          url: `${env.APP_URL}/human-actions/${applicationId}?token=${metadata?.['token']}`
        },
      }, notificationOpts);
    }

    // Real-time propagation — scoped to the owning user only
    await messaging.publisher.publish(
      `application-events:${app.candidate.user.id}`,
      JSON.stringify({ applicationId, toState, event })
    );

    return updatedApp;
  });
}

const startOfUtcDay = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const hasText = (value?: string | null) => Boolean(value?.trim());

export async function createEligibleApplication(input: {
  jobId: number;
  candidateId: number;
  minimumMatchScore: number;
  matchScore: number;
}) {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.candidateProfile.findUnique({
      where: { id: input.candidateId },
      include: {
        user: { include: { automation: true, policy: true, resumes: true } },
      },
    });
    if (!candidate) return { created: false as const, reason: 'CANDIDATE_PROFILE_MISSING' };

    const policy = candidate.user.policy;
    const automation = candidate.user.automation;
    if (!automation?.autoApplyEnabled || automation.workerStatus !== 'RUNNING') {
      return { created: false as const, reason: 'AUTOMATION_DISABLED' };
    }

    if (input.matchScore < input.minimumMatchScore) {
      return { created: false as const, reason: 'MATCH_SCORE_TOO_LOW' };
    }

    if (!hasText(candidate.name) || !hasText(candidate.user.email)) {
      return { created: false as const, reason: 'REQUIRED_PROFILE_INFO_MISSING' };
    }

    const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
    if (skills.length === 0 || !candidate.user.resumes.some((resume) => resume.isMaster)) {
      return { created: false as const, reason: 'REQUIRED_RESUME_INFO_MISSING' };
    }

    const job = await tx.job.findUnique({
      where: { id: input.jobId },
      include: { company: true },
    });
    if (!job || !hasText(job.url) || !hasText(job.description)) {
      return { created: false as const, reason: 'JOB_NOT_VALID' };
    }

    const haystack = `${job.title}\n${job.description}`.toLowerCase();
    const excludedKeyword = policy?.excludedKeywords.find((keyword) =>
      haystack.includes(keyword.toLowerCase())
    );
    if (excludedKeyword) return { created: false as const, reason: 'EXCLUDED_KEYWORD' };

    const companyName = job.company?.name.toLowerCase() ?? '';
    const excludedCompany = policy?.excludedCompanies.find((company) =>
      companyName === company.toLowerCase()
    );
    if (excludedCompany) return { created: false as const, reason: 'EXCLUDED_COMPANY' };

    const existing = await tx.application.findUnique({
      where: {
        candidateId_canonicalJobId: {
          candidateId: candidate.id,
          canonicalJobId: job.canonicalFingerprint,
        },
      },
    });
    if (existing) return { created: false as const, reason: 'DUPLICATE_APPLICATION', application: existing };

    const limit = policy?.maxApplicationsPerDay ?? env.MAX_APPLICATIONS_PER_DAY;
    const today = startOfUtcDay();
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "CandidateDailyApplicationCount" ("candidateId", "date", "count", "updatedAt")
                 VALUES (${candidate.id}, ${today}, 0, NOW())
                 ON CONFLICT ("candidateId", "date") DO NOTHING`
    );

    const claimed = await tx.candidateDailyApplicationCount.updateMany({
      where: { candidateId: candidate.id, date: today, count: { lt: limit } },
      data: { count: { increment: 1 } },
    });
    if (claimed.count !== 1) return { created: false as const, reason: 'DAILY_LIMIT_REACHED' };

    const application = await tx.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        canonicalJobId: job.canonicalFingerprint,
        status: 'DISCOVERED',
      },
    });

    return { created: true as const, application };
  });
}
