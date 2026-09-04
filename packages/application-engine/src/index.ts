import { prisma, ApplicationStatus } from '@autoapply/database';
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
  APPLYING: ['SUBMITTED', 'FAILED', 'RETRYING', 'NEEDS_HUMAN'],
  SUBMITTED: ['VERIFYING'],
  VERIFYING: ['VERIFIED', 'FAILED', 'RETRYING'],
  VERIFIED: [],
  FAILED: ['RETRYING', 'CANCELLED'],
  RETRYING: ['APPLYING', 'VERIFYING', 'FAILED'],
  NEEDS_HUMAN: ['APPLYING', 'CANCELLED', 'REJECTED'],
  CANCELLED: [],
};

type NotificationQueue = {
  close(): Promise<void>;
  add(name: string, data: unknown): Promise<unknown>;
};

let notificationQueue: NotificationQueue | undefined;
let publisher: Redis | undefined;

async function getMessagingClients() {
  const { Queue, QUEUE_NAMES, connection } = await import('@autoapply/queue');
  notificationQueue ??= new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection });
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

    if (toState === 'VERIFIED') {
      await messaging.notificationQueue.add('notify', {
        type: 'VERIFIED',
        recipient: app.candidate.user.email,
        subject: `Application Verified: ${roleName} at ${companyName}`,
        message: `Great news! Your application for ${roleName} at ${companyName} has been successfully submitted and verified.`,
        relatedApplicationId: applicationId,
        metadata,
      });
    } else if (toState === 'NEEDS_HUMAN') {
      await messaging.notificationQueue.add('notify', {
        type: 'NEEDS_HUMAN',
        recipient: app.candidate.user.email,
        subject: `Action Required: Application for ${roleName} at ${companyName}`,
        message: `Your application for ${roleName} at ${companyName} requires human intervention (e.g., CAPTCHA or missing info). Please visit the Human Action Center in your dashboard to continue.`,
        relatedApplicationId: applicationId,
        metadata,
      });
    }

    // Real-time propagation
    await messaging.publisher.publish('application-events', JSON.stringify({
      applicationId,
      toState,
      event,
    }));

    return updatedApp;
  });
}
