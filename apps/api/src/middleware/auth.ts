import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '@autoapply/config';
import { isTokenRevoked } from '../routes/auth.js';

export const verifyToken = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.cookies['jwt'];

  if (!token) {
    return reply.status(401).send({ success: false, error: { code: 'ERROR', message: 'Unauthorized: No token provided' } });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number; jti?: string };

    // Check if token has been revoked (e.g. via logout)
    if (decoded.jti && await isTokenRevoked(decoded.jti)) {
      return reply.status(401).send({ success: false, error: { code: 'ERROR', message: 'Unauthorized: Session has been invalidated' } });
    }

    request.user = { id: decoded.userId };
  } catch {
    return reply.status(401).send({ success: false, error: { code: 'ERROR', message: 'Unauthorized: Invalid token' } });
  }
};
