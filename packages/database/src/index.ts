import { PrismaClient } from '@prisma/client';
import { env } from '@autoapply/config';

const prismaClientSingleton = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });
};

declare global {
  var prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

export async function recordDeadLetter(input: {
  jobId: string;
  queueName: string;
  error: string;
  attemptCount: number;
  stackTrace?: string | null;
}) {
  await prisma.deadLetter.upsert({
    where: { queueName_jobId: { queueName: input.queueName, jobId: input.jobId } },
    update: {
      error: input.error,
      attemptCount: input.attemptCount,
      stackTrace: input.stackTrace ?? null,
      timestamp: new Date(),
    },
    create: {
      jobId: input.jobId,
      queueName: input.queueName,
      error: input.error,
      attemptCount: input.attemptCount,
      stackTrace: input.stackTrace ?? null,
    },
  });
}

export * from '@prisma/client';
