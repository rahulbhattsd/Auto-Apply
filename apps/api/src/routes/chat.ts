import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth.js';
import { agentOrchestrator } from '../services/orchestrator.js';

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const postMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content cannot be empty'),
});

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  // GET /api/chat/conversations - list user's conversations
  fastify.get('/conversations', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const conversations = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { messages: true },
          },
        },
      });

      return reply.send(conversations);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch conversations' },
      });
    }
  });

  // POST /api/chat/conversations - create new conversation
  fastify.post('/conversations', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const data = createConversationSchema.parse(request.body || {});
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title: data.title || 'New Conversation',
        },
      });

      return reply.status(201).send(conversation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors },
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create conversation' },
      });
    }
  });

  // GET /api/chat/conversations/:id - get conversation with all messages
  fastify.get('/conversations/:id', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const convId = parseInt(id, 10);

    if (isNaN(convId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid conversation ID' } });
    }

    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: convId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Conversation not found' },
        });
      }

      if (conversation.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied to this conversation' },
        });
      }

      return reply.send(conversation);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch conversation' },
      });
    }
  });

  // POST /api/chat/conversations/:id/messages - send message & generate AI response
  fastify.post('/conversations/:id/messages', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const convId = parseInt(id, 10);

    if (isNaN(convId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid conversation ID' } });
    }

    try {
      const data = postMessageSchema.parse(request.body);

      // Verify conversation ownership
      const conversation = await prisma.conversation.findUnique({
        where: { id: convId },
      });

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Conversation not found' },
        });
      }

      if (conversation.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied to this conversation' },
        });
      }

      // Auto-title conversation if it still has default title and this is the first exchange
      if (conversation.title === 'New Conversation') {
        const autoTitle = data.content.length > 30 ? data.content.slice(0, 30) + '...' : data.content;
        await prisma.conversation.update({
          where: { id: convId },
          data: { title: autoTitle },
        });
      }

      // Run orchestrator to process user message, retrieve memories, execute tools, and generate reply
      const result = await agentOrchestrator.processMessage({
        conversationId: convId,
        userId,
        userMessage: data.content,
      });

      return reply.status(200).send({
        success: true,
        message: {
          id: result.messageId,
          conversationId: convId,
          role: result.role,
          content: result.content,
          toolsUsed: result.toolsUsed,
          memoriesRetrieved: result.memoriesRetrieved,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors },
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to process message' },
      });
    }
  });

  // PATCH /api/chat/conversations/:id - rename conversation
  fastify.patch('/conversations/:id', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const convId = parseInt(id, 10);

    if (isNaN(convId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid conversation ID' } });
    }

    try {
      const data = updateConversationSchema.parse(request.body);

      const conversation = await prisma.conversation.findUnique({ where: { id: convId } });
      if (!conversation) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
      }
      if (conversation.userId !== userId) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }

      const updated = await prisma.conversation.update({
        where: { id: convId },
        data: { title: data.title },
      });

      return reply.send(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors },
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update conversation' } });
    }
  });

  // DELETE /api/chat/conversations/:id - delete conversation
  fastify.delete('/conversations/:id', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const convId = parseInt(id, 10);

    if (isNaN(convId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid conversation ID' } });
    }

    try {
      const conversation = await prisma.conversation.findUnique({ where: { id: convId } });
      if (!conversation) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
      }
      if (conversation.userId !== userId) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }

      await prisma.conversation.delete({ where: { id: convId } });
      return reply.send({ success: true, message: 'Conversation deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete conversation' } });
    }
  });
}
