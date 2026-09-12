import { FastifyInstance } from 'fastify';
import { verifyToken } from '../middleware/auth.js';
import { env } from '@autoapply/config';
import jwt from 'jsonwebtoken';
import { connection } from '@autoapply/queue';

export default async function humanActionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.get('/api/human-action/:applicationId', async (request, reply) => {
    const { applicationId } = request.params as { applicationId: string };
    const { token } = request.query as { token: string };
    const userId = request.user!.id;
    const appId = Number(applicationId);

    if (!token) {
      return reply.status(400).send({ success: false, error: 'Token is required' });
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { applicationId: number; userId: number };

      if (decoded.applicationId !== appId || decoded.userId !== userId) {
        return reply.status(403).send({ success: false, error: 'Invalid token scope' });
      }

      const connectionInfoStr = await connection.get(`novnc:${token}`);
      if (!connectionInfoStr) {
        return reply.status(404).send({ success: false, error: 'Session expired or not found' });
      }

      const connectionInfo = JSON.parse(connectionInfoStr);

      return reply.send({ success: true, connection: connectionInfo, token });
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid or expired token' });
    }
  });

  fastify.get('/api/human-action/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token: string }).token;
    if (!token) return socket.close(1008, 'Token required');
    try {
      jwt.verify(token, env.JWT_SECRET);
      const connStr = await connection.get(`novnc:${token}`);
      if (!connStr) return socket.close(1008, 'Session expired');
      const conn = JSON.parse(connStr);

      const WebSocket = (await import('ws')).default;
      const proxy = new WebSocket(`ws://${conn.host}:${conn.port}`);

      proxy.on('message', (msg) => socket.send(msg));
      socket.on('message', (msg) => proxy.send(msg));
      proxy.on('close', () => socket.close());
      socket.on('close', () => proxy.close());
      proxy.on('error', (err) => { req.log.error(err); socket.close(); });
    } catch {
      socket.close(1008, 'Invalid token');
    }
  });
}
