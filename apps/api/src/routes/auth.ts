import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '@autoapply/database';
import { env } from '@autoapply/config';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', async (request, reply) => {
    try {
      const data = registerSchema.parse(request.body);

      const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingUser) {
        return reply.status(400).send({ success: false, error: { code: 'ERROR', message: 'Email already in use' } });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = await prisma.user.create({
        data: {
          email: data.email,
          hashedPassword,
        },
      });

      const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '7d' });

      reply.setCookie('jwt', token, {
        path: '/',
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      await prisma.auditLog.create({ data: { userId: user.id, action: 'REGISTER', targetType: 'User', targetId: user.id, metadata: { email: user.email } } });
      return reply.status(201).send({ id: user.id, email: user.email });
    } catch (error) {
      console.error('ERROR IN REGISTER ROUTE:', error);
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Internal server error' } });
    }
  });

  fastify.post('/login', async (request, reply) => {
    try {
      const data = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { email: data.email } });
      if (!user) {
        return reply.status(401).send({ success: false, error: { code: 'ERROR', message: 'Invalid email or password' } });
      }

      const isPasswordValid = await bcrypt.compare(data.password, user.hashedPassword);
      if (!isPasswordValid) {
        return reply.status(401).send({ success: false, error: { code: 'ERROR', message: 'Invalid email or password' } });
      }

      const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '7d' });

      reply.setCookie('jwt', token, {
        path: '/',
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      await prisma.auditLog.create({ data: { userId: user.id, action: 'LOGIN', targetType: 'User', targetId: user.id } });
      return reply.send({ id: user.id, email: user.email });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Internal server error' } });
    }
  });

  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('jwt', { path: '/' });
    const token = request.cookies['jwt'];
    if (token) {
        try {
            const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number };
            await prisma.auditLog.create({ data: { userId: decoded.userId, action: 'LOGOUT', targetType: 'User', targetId: decoded.userId } });
        } catch(e) {}
    }
    return reply.send({ success: true });
  });
}
