import { z } from 'zod';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  COOKIE_SECURE: z.coerce.boolean().optional(),
  SERVE_WEB: z.coerce.boolean().default(false),
  MAX_APPLICATIONS_PER_DAY: z.coerce.number().default(25),
  JOB_DISCOVERY_INTERVAL_MINUTES: z.coerce.number().default(30),
  MAX_CONCURRENT_APPLICATIONS: z.coerce.number().default(2),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama3-8b-8192'),
  PLAYWRIGHT_HEADLESS: z.coerce.boolean().default(true),
  PLAYWRIGHT_BROWSER: z.enum(['chromium']).default('chromium'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  S3_ENDPOINT: z.string(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
});

const renderExternalUrl = process.env['RENDER_EXTERNAL_URL'];
const normalizedEnv = {
  ...process.env,
  APP_URL: process.env['APP_URL'] || renderExternalUrl,
  API_URL: process.env['API_URL'] || renderExternalUrl,
};

const _env = envSchema.safeParse(normalizedEnv);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
