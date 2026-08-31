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
      console.log('Registering user...');
      const data = registerSchema.parse(request.body);

      console.log('Checking existing user...');
      const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingUser) {
        return reply.status(400).send({ error: 'Email already in use' });
      }

      console.log('Hashing password...');
      const hashedPassword = await bcrypt.hash(data.password, 10);

      console.log('Creating user in db...');
      const user = await prisma.user.create({
        data: {
          email: data.email,
          hashedPassword,
        },
      });

      console.log('Signing token...');
      const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '7d' });

      console.log('Setting cookie...');
      reply.setCookie('jwt', token, {
        path: '/',
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.status(201).send({ id: user.id, email: user.email });
    } catch (error) {
      console.error('ERROR IN REGISTER ROUTE:', error);
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.post('/login', async (request, reply) => {
    try {
      const data = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { email: data.email } });
      if (!user) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const isPasswordValid = await bcrypt.compare(data.password, user.hashedPassword);
      if (!isPasswordValid) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '7d' });

      reply.setCookie('jwt', token, {
        path: '/',
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.send({ id: user.id, email: user.email });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.post('/logout', async (_request, reply) => {
    reply.clearCookie('jwt', { path: '/' });
    return reply.send({ success: true });
  });
}
