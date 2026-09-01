#!/bin/bash
set -e

mkdir -p workers/notification-worker/src
cat << 'INNEREOF' > workers/notification-worker/package.json
{
  "name": "@autoapply/notification-worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@autoapply/config": "workspace:*",
    "@autoapply/database": "workspace:*",
    "@autoapply/queue": "workspace:*",
    "@autoapply/shared": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@autoapply/eslint-config": "workspace:^",
    "@autoapply/typescript-config": "workspace:*",
    "@eslint/js": "^9.0.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "typescript-eslint": "^8.0.0"
  }
}
INNEREOF

cat << 'INNEREOF' > workers/notification-worker/tsconfig.json
{
  "extends": "@autoapply/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
INNEREOF

cat << 'INNEREOF' > workers/notification-worker/eslint.config.js
import baseConfig from '@autoapply/eslint-config/base.js';

export default [
  ...baseConfig,
];
INNEREOF

cat << 'INNEREOF' > workers/notification-worker/src/index.ts
import { Worker, QUEUE_NAMES, connection } from '@autoapply/queue';
import { prisma } from '@autoapply/database';
import { EmailNotificationProvider } from '@autoapply/shared/src/notifications.js';
import { NotificationPayload } from '@autoapply/shared/src/notifications.js';

const provider = new EmailNotificationProvider();

const worker = new Worker(
  QUEUE_NAMES.NOTIFICATIONS,
  async (job) => {
    const payload = job.data as NotificationPayload;
    console.log(`[NotificationWorker] Processing notification job ${job.id} of type ${payload.type}`);

    try {
      await provider.notify(payload);

      await prisma.notification.create({
        data: {
          type: payload.type,
          recipient: payload.recipient,
          payload: payload.metadata ? JSON.parse(JSON.stringify(payload.metadata)) : undefined,
          ...(payload.relatedApplicationId ? { relatedApplicationId: payload.relatedApplicationId } : {}),
          sentAt: new Date(),
        }
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`[NotificationWorker] Failed to send notification: ${err.message}`);
      }
      throw err;
    }
  },
  { connection }
);

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
    await prisma.deadLetter.create({
      data: {
        jobId: job.id!,
        queueName: QUEUE_NAMES.NOTIFICATIONS,
        error: err.message,
        attemptCount: job.attemptsMade,
        stackTrace: err.stack || null
      }
    });
  }
});

worker.on('ready', () => console.log('Notification Worker started'));
INNEREOF
