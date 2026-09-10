import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import fs from 'fs';
import path from 'path';
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
import metricsRoutes from './routes/metrics.js';
import humanActionRoutes from './routes/human-action.js';

export const buildApp = () => {
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [env.APP_URL];

  const fastify = Fastify({
    logger: env.NODE_ENV === 'development' ? { level: 'debug', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } } } : { level: 'info' },
    disableRequestLogging: true,
  });

  fastify.addHook('onRequest', (request, _reply, done) => { request.log.info({ reqId: request.id, method: request.method, url: request.url, service: 'api' }, 'received request'); done(); });
  fastify.addHook('onRequest', (request, reply, done) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || !request.url.startsWith('/api')) return done();
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    let source = origin;
    try {
      source ||= referer ? new URL(referer).origin : undefined;
    } catch {
      reply.status(403).send({ success: false, error: { code: 'CSRF_ORIGIN_DENIED', message: 'Origin not allowed' } });
      return;
    }
    if (source && !allowedOrigins.includes(source)) {
      reply.status(403).send({ success: false, error: { code: 'CSRF_ORIGIN_DENIED', message: 'Origin not allowed' } });
      return;
    }
    done();
  });
  fastify.addHook('onResponse', (request, reply, done) => { request.log.info({ reqId: request.id, method: request.method, url: request.url, statusCode: reply.statusCode, responseTime: reply.elapsedTime, service: 'api' }, 'request completed'); done(); });

  fastify.register(websocket);
  fastify.register(cors, { origin: allowedOrigins, credentials: true });
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
  fastify.register(metricsRoutes);
  fastify.register(humanActionRoutes);

  if (env.SERVE_WEB) {
    const webDistDir = path.resolve(__dirname, '../../web/dist');
    if (fs.existsSync(path.join(webDistDir, 'index.html'))) {
      fastify.register(fastifyStatic, {
        root: webDistDir,
        prefix: '/',
      });

      fastify.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api')) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
        }

        return reply.sendFile('index.html');
      });
    } else {
      fastify.log.warn({ webDistDir }, 'SERVE_WEB is enabled but the built web app was not found');
    }
  }

  return fastify;
};
