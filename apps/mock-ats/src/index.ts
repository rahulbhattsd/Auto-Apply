import Fastify from 'fastify';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const multipart = require('@fastify/multipart');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cors = require('@fastify/cors');

import { greenhouseRoutes } from './routes/greenhouse.js';
import { leverRoutes } from './routes/lever.js';
import { workdayRoutes } from './routes/workday.js';
import { ashbyRoutes } from './routes/ashby.js';
import { workableRoutes } from './routes/workable.js';
import { darwinboxRoutes } from './routes/darwinbox.js';
import { adminRoutes } from './routes/admin.js';

const PORT = Number(process.env.MOCK_ATS_PORT ?? 4000);
const HOST = process.env.MOCK_ATS_HOST ?? '0.0.0.0';

async function main() {
  const app = Fastify({ logger: { level: 'info' }, trustProxy: true });

  // ── Plugins ──────────────────────────────────────────────────────────────────
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB max resume upload
      files: 1,
      fields: 20,
    },
  });

  // Parse URL-encoded bodies for Workday step2 redirect
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const parsed: Record<string, string> = {};
        for (const [k, v] of new URLSearchParams(body as string).entries()) {
          parsed[k] = v;
        }
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // ── Health check ──────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', service: 'mock-ats', ts: new Date().toISOString() }));

  // ── Root redirect ─────────────────────────────────────────────────────────────
  app.get('/', async (_req, reply) => reply.redirect('/admin'));

  // ── ATS Routes ────────────────────────────────────────────────────────────────
  await app.register(greenhouseRoutes);
  await app.register(leverRoutes);
  await app.register(workdayRoutes);
  await app.register(ashbyRoutes);
  await app.register(workableRoutes);
  await app.register(darwinboxRoutes);

  // ── Admin UI ──────────────────────────────────────────────────────────────────
  await app.register(adminRoutes);

  // ── Start ─────────────────────────────────────────────────────────────────────
  await app.listen({ port: PORT, host: HOST });

  console.log(`\n🧪 Mock-ATS running at http://localhost:${PORT}`);
  console.log(`   Admin dashboard  → http://localhost:${PORT}/admin`);
  console.log(`   Greenhouse jobs  → http://localhost:${PORT}/greenhouse/techcorp/jobs`);
  console.log(`   Lever jobs       → http://localhost:${PORT}/lever/financehub/jobs`);
  console.log(`   Workday jobs     → http://localhost:${PORT}/workday/healthstart/jobs`);
  console.log(`   Ashby jobs       → http://localhost:${PORT}/ashby/retailgiant/jobs`);
  console.log(`   Workable jobs    → http://localhost:${PORT}/workable/devagency/jobs`);
  console.log(`   Darwinbox jobs   → http://localhost:${PORT}/darwinbox/globalcorp/jobs`);
  console.log(`\n   Set MOCK_ATS_CAPTCHA=never to disable CAPTCHA simulation.\n`);
}

main().catch((err) => {
  console.error('Mock-ATS failed to start:', err);
  process.exit(1);
});
