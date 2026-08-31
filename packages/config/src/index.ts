import { z } from 'zod';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  MAX_APPLICATIONS_PER_DAY: z.coerce.number().default(25),
  JOB_DISCOVERY_INTERVAL_MINUTES: z.coerce.number().default(30),
  MAX_CONCURRENT_APPLICATIONS: z.coerce.number().default(2),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
