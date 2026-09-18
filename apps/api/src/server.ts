import { env, allowedEmails } from '@autoapply/config';
import { prisma } from '@autoapply/database';
import { connection as redisConnection, setupJobTracker } from '@autoapply/queue';
import { buildApp } from './app.js';

let app: ReturnType<typeof buildApp> | undefined;

/** Log a warning for any existing users whose email is not in the allowlist. */
async function checkAllowlistCompliance() {
  if (allowedEmails.length === 0) {
    return; // No allowlist configured — skip check
  }

  try {
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true },
    });

    const nonAllowlisted = allUsers.filter(
      (u) => !allowedEmails.includes(u.email.toLowerCase()),
    );

    if (nonAllowlisted.length > 0) {
      console.warn('⚠️  The following existing users are NOT in ALLOWED_EMAILS and will be unable to log in:');
      for (const u of nonAllowlisted) {
        console.warn(`   - id=${u.id}  email=${u.email}`);
      }
      console.warn('   Review these accounts and decide whether to remove them manually.');
    }
  } catch (err) {
    console.warn('⚠️  Could not check user allowlist compliance at startup:', err);
  }
}

const start = async () => {
  try {
    app = buildApp();

    // Readiness endpoint: verifies DB and Redis
    app.get('/api/ready', async (_request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        await redisConnection.ping();
        return reply.send({ status: 'ok', db: 'ok', redis: 'ok' });
      } catch (error) {
        app?.log.error(error, 'Ready check failed');
        return reply.status(503).send({
          success: false,
          error: { code: 'NOT_READY', message: 'Service dependencies not ready' },
        });
      }
    });

    // Initialize job tracker
    try {
      setupJobTracker();
    } catch (trackerErr) {
      app.log.warn(`Job tracker initialization failed (Redis might be connecting): ${trackerErr}`);
    }

    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Personal AI Agent API server running at http://${env.HOST}:${env.PORT}`);

    // Check for existing users not in the allowlist (non-blocking)
    await checkAllowlistCompliance();
  } catch (err) {
    console.error('Fatal API startup error:', err);
    process.exit(1);
  }
};

start();

const shutdown = async (signal: NodeJS.Signals) => {
  console.log(`Received ${signal}, initiating graceful shutdown...`);
  try {
    if (app) {
      await app.close();
    }
    await redisConnection.quit().catch(() => {});
    await prisma.$disconnect();
    console.log('Clean shutdown complete.');
    process.exit(0);
  } catch (error) {
    console.error(`Failed to shut down cleanly after ${signal}:`, error);
    process.exit(1);
  }
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
