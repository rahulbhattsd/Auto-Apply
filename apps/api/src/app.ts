import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { env } from '@autoapply/config';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import policyRoutes from './routes/policy.js';
import resumesRoutes from './routes/resumes.js';
import { jobRoutes } from './routes/jobs.js';
import eventsRoutes from './routes/events.js';
import dashboardRoutes from './routes/dashboard.js';
import applicationsRoutes from './routes/applications.js';
import analyticsRoutes from './routes/analytics.js';

export const buildApp = () => {
  const fastify = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  fastify.register(cors, { origin: env.APP_URL, credentials: true });
  fastify.register(cookie, { secret: env.JWT_SECRET });
  fastify.register(multipart);
  fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  fastify.register(async (app) => {
    app.register(rateLimit, { max: 5, timeWindow: '1 minute' });
    app.register(authRoutes);
  }, { prefix: '/api/auth' });

  fastify.register(profileRoutes, { prefix: '/api/profile' });
  fastify.register(policyRoutes, { prefix: '/api/policy' });
  fastify.register(resumesRoutes, { prefix: '/api/resumes' });
  fastify.register(jobRoutes, { prefix: '/api' });
  fastify.register(eventsRoutes);
  fastify.register(dashboardRoutes);
  fastify.register(applicationsRoutes);
  fastify.register(analyticsRoutes);

  return fastify;
};
