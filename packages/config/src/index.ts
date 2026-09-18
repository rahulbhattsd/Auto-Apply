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
  JWT_SECRET: z.string().min(10, 'JWT_SECRET must be at least 10 characters long'),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  COOKIE_SECURE: z.coerce.boolean().optional(),
  SERVE_WEB: z.coerce.boolean().default(false),
  
  // AI Provider Configuration
  AI_PROVIDER: z.enum(['groq', 'mock', 'openai']).default('groq'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Task & Queue Configuration
  TASK_QUEUE_NAME: z.string().default('agent-tasks'),
  MAX_TASK_ATTEMPTS: z.coerce.number().default(3),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(15000),
  WORKER_HEARTBEAT_TIMEOUT_MS: z.coerce.number().default(45000),

  // Access Control
  ALLOWED_EMAILS: z.string().optional(),

  // Alerting
  ALERT_WEBHOOK_URL: z.string().url().optional(),

  // Optional External Services
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

const renderExternalUrl = process.env['RENDER_EXTERNAL_URL'];

const renderOrigin = renderExternalUrl
  ? renderExternalUrl.replace(/\/$/, '')
  : undefined;

const withScheme = (raw: string | undefined): string | undefined => {
  if (!raw) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `https://${raw}`;
};

const normalizedEnv = {
  ...process.env,
  APP_URL: withScheme(process.env['APP_URL'] || renderOrigin),
  API_URL: withScheme(process.env['API_URL'] || renderOrigin),
  ALLOWED_ORIGINS: (() => {
    const explicit = process.env['ALLOWED_ORIGINS'];
    if (explicit && explicit.trim().length > 0) return explicit;
    return renderOrigin ?? undefined;
  })(),
};

const _env = envSchema.safeParse(normalizedEnv);

if (!_env.success) {
  // Never print raw secrets in errors
  const formatted = _env.error.format();
  console.error('❌ Invalid environment variables configuration');
  for (const [key, val] of Object.entries(formatted)) {
    if (key !== '_errors' && val && typeof val === 'object' && '_errors' in val) {
      console.error(`  - ${key}: ${(val as { _errors: string[] })._errors.join(', ')}`);
    }
  }
  process.exit(1);
}

export const env = _env.data;

/** Parsed email allowlist — empty array means unrestricted access. */
export const allowedEmails: string[] = (env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
