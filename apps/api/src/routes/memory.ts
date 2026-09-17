import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../middleware/auth.js';
import { memoryService, MemoryType, UpdateMemoryInput, GetMemoriesOptions } from '../services/memory.js';

const memoryTypeSchema = z.enum(['PROFILE', 'PREFERENCE', 'PROJECT', 'FACT', 'INSTRUCTION', 'CONTEXT']);

const createMemorySchema = z.object({
  type: memoryTypeSchema.optional().default('FACT'),
  key: z.string().trim().min(1, 'Key is required').max(100),
  content: z.string().trim().min(1, 'Content is required'),
  metadata: z.record(z.unknown()).optional(),
  importance: z.number().int().min(1).max(5).optional().default(1),
});

const updateMemorySchema = z.object({
  type: memoryTypeSchema.optional(),
  key: z.string().trim().min(1).max(100).optional(),
  content: z.string().trim().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
  importance: z.number().int().min(1).max(5).optional(),
});

export default async function memoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  // GET /api/memory - list/search memories
  fastify.get('/', async (request, reply) => {
    const userId = request.user!.id;
    const query = (request.query as { q?: string; type?: string; limit?: string; offset?: string }) || {};

    try {
      const options: GetMemoriesOptions = {};
      if (query.q) options.query = query.q;
      if (query.type) options.type = query.type;
      if (query.limit) options.limit = parseInt(query.limit, 10);
      if (query.offset) options.offset = parseInt(query.offset, 10);

      const result = await memoryService.getMemories(userId, options);
      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch memories' },
      });
    }
  });

  // POST /api/memory - create explicit memory
  fastify.post('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const data = createMemorySchema.parse(request.body);
      const memory = await memoryService.createMemory(userId, {
        type: data.type as MemoryType,
        key: data.key,
        content: data.content,
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        importance: data.importance,
      });

      return reply.status(201).send(memory);
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
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create memory' },
      });
    }
  });

  // PATCH /api/memory/:id - update memory
  fastify.patch('/:id', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const memoryId = parseInt(id, 10);

    if (isNaN(memoryId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid memory ID' } });
    }

    try {
      const data = updateMemorySchema.parse(request.body);
      const updateInput: UpdateMemoryInput = {};
      if (data.type !== undefined) updateInput.type = data.type as MemoryType;
      if (data.key !== undefined) updateInput.key = data.key;
      if (data.content !== undefined) updateInput.content = data.content;
      if (data.metadata !== undefined) updateInput.metadata = data.metadata;
      if (data.importance !== undefined) updateInput.importance = data.importance;

      const updated = await memoryService.updateMemory(userId, memoryId, updateInput);
      return reply.send(updated);
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
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to update memory' },
      });
    }
  });

  // DELETE /api/memory/:id - delete memory
  fastify.delete('/:id', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const memoryId = parseInt(id, 10);

    if (isNaN(memoryId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid memory ID' } });
    }

    try {
      await memoryService.deleteMemory(userId, memoryId);
      return reply.send({ success: true, message: 'Memory deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to delete memory' },
      });
    }
  });
}
