import { Redis } from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { env } from '@autoapply/config';

export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const QUEUE_NAMES = {
  AGENT_TASKS: 'agent-tasks',
  NOTIFICATIONS: 'notifications',
  // Backward compatibility stubs
  JOB_DISCOVERY: 'job-discovery',
  JOB_ANALYSIS: 'job-analysis',
  RESUME_GENERATION: 'resume-generation',
  APPLICATION: 'application',
  VERIFICATION: 'verification',
};

export const TASK_TYPES = {
  AI_TASK: 'AI_TASK',
  RESEARCH_TASK: 'RESEARCH_TASK',
  MEMORY_TASK: 'MEMORY_TASK',
  NOTIFICATION_TASK: 'NOTIFICATION_TASK',
  MAINTENANCE_TASK: 'MAINTENANCE_TASK',
} as const;

export type TaskType = (typeof TASK_TYPES)[keyof typeof TASK_TYPES];

export const TASK_STATUSES = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING',
  CANCELLED: 'CANCELLED',
} as const;

export type TaskStatus = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];

export const DEFAULT_RETRY_CONFIG = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
};

export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
};

export const agentTaskQueue = new Queue(QUEUE_NAMES.AGENT_TASKS, {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const RETRY_POLICIES = {
  NETWORK_ERROR: { attempts: 4, backoff: { type: 'exponential' as const, delay: 5000 } },
  AI_ERROR: { attempts: 3, backoff: { type: 'exponential' as const, delay: 10000 } },
  TASK_ERROR: { attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 } },
  DEFAULT: DEFAULT_RETRY_CONFIG,
};

export { Queue, Worker, QueueEvents };
export * from './tracker.js';
export * from './heartbeat.js';
