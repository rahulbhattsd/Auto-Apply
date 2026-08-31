import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '@autoapply/config';

export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export { Queue };
