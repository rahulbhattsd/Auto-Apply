import { Redis } from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { env } from '@autoapply/config';

export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const QUEUE_NAMES = {
  JOB_DISCOVERY: 'job-discovery',
  JOB_ANALYSIS: 'job-analysis',
  RESUME_GENERATION: 'resume-generation',
  APPLICATION: 'application',
  VERIFICATION: 'verification',
  NOTIFICATIONS: 'notifications',
};

export const DEFAULT_RETRY_CONFIG = {
  attempts: 4,
  backoff: {
    type: 'exponential',
    delay: 30000,
  },
};

export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
};

export const RETRY_POLICIES = {
  NETWORK_ERROR: { attempts: 4, backoff: { type: 'exponential', delay: 30000 } },
  AI_ERROR: { attempts: 3, backoff: { type: 'exponential', delay: 60000 } },
  BROWSER_ERROR: { attempts: 3, backoff: { type: 'fixed', delay: 120000 } },
  EXTERNAL_SITE_ERROR: { attempts: 5, backoff: { type: 'exponential', delay: 60000 } },
  DEFAULT: DEFAULT_RETRY_CONFIG,
};

export { Queue, Worker, QueueEvents };
export * from './tracker.js';
