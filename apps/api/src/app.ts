import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { env } from '@autoapply/config';

import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import policyRoutes from './routes/policy';
import resumesRoutes from './routes/resumes';

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

  return fastify;
};
