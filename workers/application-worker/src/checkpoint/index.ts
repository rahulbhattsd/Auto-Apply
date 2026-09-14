import { prisma, ApplicationExecutionCheckpoint, Prisma } from '@autoapply/database';
import { ApplicationOutcome } from '@autoapply/shared';

export type CheckpointParams = {
  applicationId: number;
  adapter?: string;
  currentStep?: number;
  currentUrl?: string;
  lastAction?: string;
  currentOutcome?: ApplicationOutcome;
  hasSubmitted?: boolean;
  submissionEvidence?: unknown;
};

export async function createOrUpdateCheckpoint(
  params: CheckpointParams,
  incrementAttempt = false
): Promise<ApplicationExecutionCheckpoint> {
  const existing = await prisma.applicationExecutionCheckpoint.findUnique({
    where: { applicationId: params.applicationId }
  });

  if (existing) {
    return prisma.applicationExecutionCheckpoint.update({
      where: { applicationId: params.applicationId },
      data: {
        executionAttempt: incrementAttempt ? existing.executionAttempt + 1 : existing.executionAttempt,
        adapter: params.adapter ?? existing.adapter,
        currentStep: params.currentStep ?? existing.currentStep,
        currentUrl: params.currentUrl ?? existing.currentUrl,
        lastAction: params.lastAction ?? existing.lastAction,
        currentOutcome: params.currentOutcome ? (params.currentOutcome as unknown as Prisma.InputJsonValue) : existing.currentOutcome ?? Prisma.DbNull,
        hasSubmitted: params.hasSubmitted ?? existing.hasSubmitted,
        submissionEvidence: params.submissionEvidence ? (params.submissionEvidence as Prisma.InputJsonValue) : existing.submissionEvidence ?? Prisma.DbNull,
      }
    });
  }

  return prisma.applicationExecutionCheckpoint.create({
    data: {
      applicationId: params.applicationId,
      executionAttempt: incrementAttempt ? 1 : 0,
      adapter: params.adapter ?? null,
      currentStep: params.currentStep ?? 0,
      currentUrl: params.currentUrl ?? null,
      lastAction: params.lastAction ?? null,
      currentOutcome: params.currentOutcome ? (params.currentOutcome as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      hasSubmitted: params.hasSubmitted ?? false,
      submissionEvidence: params.submissionEvidence ? (params.submissionEvidence as Prisma.InputJsonValue) : Prisma.DbNull,
    }
  });
}

export async function getCheckpoint(applicationId: number): Promise<ApplicationExecutionCheckpoint | null> {
  return prisma.applicationExecutionCheckpoint.findUnique({
    where: { applicationId }
  });
}

export async function incrementRetryCount(applicationId: number): Promise<void> {
    await prisma.applicationExecutionCheckpoint.updateMany({
        where: { applicationId },
        data: {
            retryCount: { increment: 1 }
        }
    });
}
