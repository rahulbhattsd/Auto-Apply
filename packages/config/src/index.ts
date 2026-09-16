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
  MAX_CONCURRENT_HUMAN_HANDOFFS: z.coerce.number().default(3),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
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

// On Render, RENDER_EXTERNAL_URL is the full public URL of the service
// (e.g. https://autoapply.onrender.com). We use it as fallback for all
// URL-shaped env vars when they are not explicitly provided.
const renderOrigin = renderExternalUrl
  ? renderExternalUrl.replace(/\/$/, '')   // strip trailing slash
  : undefined;

/** Ensure a URL has a scheme. Render's fromService host property gives bare hostnames. */
const withScheme = (raw: string | undefined): string | undefined => {
  if (!raw) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `https://${raw}`;
};

const normalizedEnv = {
  ...process.env,
  APP_URL: withScheme(process.env['APP_URL'] || renderOrigin),
  API_URL: withScheme(process.env['API_URL'] || renderOrigin),
  // Workers get APP_URL from the web service's host property, which Render
  // sets to a bare hostname (no scheme). Prefix it if needed.
  ALLOWED_ORIGINS: (() => {
    const explicit = process.env['ALLOWED_ORIGINS'];
    // If explicitly set and non-empty, use it as-is.
    if (explicit && explicit.trim().length > 0) return explicit;
    // Otherwise build from the Render URL — this means same-origin requests
    // from the bundled frontend will always be allowed.
    return renderOrigin ?? undefined;
  })(),
};

const _env = envSchema.safeParse(normalizedEnv);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
