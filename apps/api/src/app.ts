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
import chatRoutes from './routes/chat.js';
import memoryRoutes from './routes/memory.js';
import tasksRoutes from './routes/tasks.js';
import systemRoutes from './routes/system.js';
import dashboardRoutes from './routes/dashboard.js';
import metricsRoutes from './routes/metrics.js';
import eventsRoutes from './routes/events.js';
import jobRoutes from './routes/jobs.js';
import applicationsRoutes from './routes/applications.js';

export const buildApp = () => {
  const normalizeOrigin = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return `https://${trimmed}`;
  };

  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(normalizeOrigin).filter(Boolean)
    : [env.APP_URL];

  if (env.APP_URL && !allowedOrigins.includes(env.APP_URL)) {
    allowedOrigins.push(env.APP_URL);
  }

  const fastify = Fastify({
    logger: env.NODE_ENV === 'development'
      ? { level: 'debug', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } } }
      : { level: 'info' },
    disableRequestLogging: true,
    trustProxy: true,
  });

  fastify.addHook('onRequest', (request, _reply, done) => {
    request.log.info({ reqId: request.id, method: request.method, url: request.url, service: 'api' }, 'received request');
    done();
  });

  // CSRF Protection on non-GET / non-HEAD API mutations
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

  fastify.addHook('onResponse', (request, reply, done) => {
    request.log.info({
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
      service: 'api'
    }, 'request completed');
    done();
  });

  fastify.register(websocket);
  fastify.register(cors, { origin: allowedOrigins, credentials: true });
  fastify.register(cookie, { secret: env.JWT_SECRET });
  fastify.register(multipart);
  fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // Rate-limited Auth routes
  fastify.register(async (app) => {
    app.register(rateLimit, { max: 15, timeWindow: '1 minute' });
    app.register(authRoutes);
  }, { prefix: '/api/auth' });

  // Personal AI Agent & Job Application routes
  fastify.register(profileRoutes, { prefix: '/api/profile' });
  fastify.register(chatRoutes, { prefix: '/api/chat' });
  fastify.register(memoryRoutes, { prefix: '/api/memory' });
  fastify.register(tasksRoutes, { prefix: '/api/tasks' });
  fastify.register(jobRoutes, { prefix: '/api/jobs' });
  fastify.register(applicationsRoutes, { prefix: '/api/applications' });
  fastify.register(systemRoutes, { prefix: '/api/system' });
  fastify.register(dashboardRoutes);
  fastify.register(metricsRoutes);
  fastify.register(eventsRoutes);

  // Health and Readiness checks
  fastify.get('/api/health', async (_request, reply) => {
    return reply.send({ status: 'ok', service: 'autoapply-api', timestamp: new Date().toISOString() });
  });

  if (env.SERVE_WEB) {
    const webDistDir = process.env['WEB_DIST_DIR']
      ?? path.resolve(__dirname, '../../web/dist');
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
