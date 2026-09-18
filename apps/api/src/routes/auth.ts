import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '@autoapply/database';
import { env, allowedEmails } from '@autoapply/config';
import { connection as redis } from '@autoapply/queue';

const REVOKED_TOKEN_PREFIX = 'revoked:';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').optional(),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().optional(),
}).refine(data => {
  if (data.confirmPassword !== undefined && data.confirmPassword !== data.password) {
    return false;
  }
  return true;
}, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/** Check whether an email is permitted by the allowlist. Empty list = unrestricted. */
function isEmailAllowed(email: string): boolean {
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(email.toLowerCase());
}

/** Revoke a JWT by storing its jti in Redis until the token would naturally expire. */
async function revokeToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as { jti?: string; exp?: number } | null;
    if (!decoded?.jti || !decoded?.exp) return;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.set(`${REVOKED_TOKEN_PREFIX}${decoded.jti}`, '1', 'EX', ttl);
    }
  } catch {
    // Best-effort revocation — don't crash logout if Redis is flaky
  }
}

/** Check if a token's jti has been revoked. */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const result = await redis.get(`${REVOKED_TOKEN_PREFIX}${jti}`);
    return result !== null;
  } catch {
    // If Redis is down, fail-open (token is not considered revoked)
    return false;
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  // GET /api/auth/me - restore session
  fastify.get('/me', async (request, reply) => {
    const token = request.cookies['jwt'];
    if (!token) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'No authentication token provided' } });
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number; jti?: string };

      // Check token revocation
      if (decoded.jti && await isTokenRevoked(decoded.jti)) {
        return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session has been invalidated' } });
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          createdAt: true,
          profile: {
            select: {
              displayName: true,
              bio: true,
              timezone: true,
              preferences: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      // Re-check allowlist on every session restore
      if (!isEmailAllowed(user.email)) {
        reply.clearCookie('jwt', { path: '/' });
        return reply.status(403).send({ success: false, error: { code: 'ACCESS_DENIED', message: 'This app is invite-only. Contact the owner for access.' } });
      }

      return reply.send({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        name: user.profile?.displayName || user.email.split('@')[0],
        profile: user.profile,
      });
    } catch {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session' } });
    }
  });

  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    try {
      const data = registerSchema.parse(request.body);

      // Allowlist check — before any DB writes
      if (!isEmailAllowed(data.email)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'This app is invite-only. Contact the owner for access.' },
        });
      }

      const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingUser) {
        return reply.status(409).send({
          success: false,
          error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists' },
        });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);

      const displayName = data.name ? data.name : (data.email.split('@')[0] ?? 'User');

      const user = await prisma.user.create({
        data: {
          email: data.email,
          hashedPassword,
          profile: {
            create: {
              displayName,
              timezone: 'UTC',
            },
          },
        },
        include: { profile: true },
      });

      const jti = crypto.randomUUID();
      const token = jwt.sign({ userId: user.id, jti }, env.JWT_SECRET, { expiresIn: '7d' });

      reply.setCookie('jwt', token, {
        path: '/',
        httpOnly: true,
        secure: env.COOKIE_SECURE ?? (env.NODE_ENV === 'production'),
        sameSite: env.COOKIE_SAME_SITE,
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'REGISTER',
          targetType: 'User',
          targetId: user.id,
          metadata: { email: user.email },
        },
      });

      return reply.status(201).send({
        id: user.id,
        email: user.email,
        name: user.profile?.displayName,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0]?.message || 'Validation failed',
            details: error.errors,
          },
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create account' },
      });
    }
  });

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    try {
      const data = loginSchema.parse(request.body);

      // Allowlist check — before credential verification
      if (!isEmailAllowed(data.email)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: 'This app is invite-only. Contact the owner for access.' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { email: data.email },
        include: { profile: true },
      });

      if (!user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      const isPasswordValid = await bcrypt.compare(data.password, user.hashedPassword);
      if (!isPasswordValid) {
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      const jti = crypto.randomUUID();
      const token = jwt.sign({ userId: user.id, jti }, env.JWT_SECRET, { expiresIn: '7d' });

      reply.setCookie('jwt', token, {
        path: '/',
        httpOnly: true,
        secure: env.COOKIE_SECURE ?? (env.NODE_ENV === 'production'),
        sameSite: env.COOKIE_SAME_SITE,
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN',
          targetType: 'User',
          targetId: user.id,
        },
      });

      return reply.send({
        id: user.id,
        email: user.email,
        name: user.profile?.displayName || user.email.split('@')[0],
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0]?.message || 'Validation failed',
            details: error.errors,
          },
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to log in' },
      });
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies['jwt'];
    reply.clearCookie('jwt', { path: '/' });

    if (token) {
      // Revoke the token server-side so it can't be replayed
      await revokeToken(token);

      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number };
        await prisma.auditLog.create({
          data: {
            userId: decoded.userId,
            action: 'LOGOUT',
            targetType: 'User',
            targetId: decoded.userId,
          },
        });
      } catch {
        // Ignore invalid token on logout
      }
    }
    return reply.send({ success: true, message: 'Logged out successfully' });
  });
}
