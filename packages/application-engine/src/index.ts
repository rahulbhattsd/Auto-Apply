import { prisma, ApplicationStatus } from '@autoapply/database';

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

export async function transitionApplication(
  applicationId: number,
  toState: ApplicationStatus,
  metadata?: Record<string, unknown>
) {
  return await prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
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

    await tx.applicationEvent.create({
      data: {
        applicationId,
        jobId: app.jobId,
        eventType: toState,
        payload: metadata ? (metadata as never) : {},
      },
    });

    return updatedApp;
  });
}
