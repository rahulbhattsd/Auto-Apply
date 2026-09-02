import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '@autoapply/config';

export const verifyToken = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.cookies['jwt'];

  if (!token) {
    return reply.status(401).send({ success: false, error: { code: 'ERROR', message: 'Unauthorized: No token provided' } });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number };
    request.user = { id: decoded.userId };
  } catch {
    return reply.status(401).send({ success: false, error: { code: 'ERROR', message: 'Unauthorized: Invalid token' } });
  }
};
