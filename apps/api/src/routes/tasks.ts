import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../middleware/auth.js';
import { taskService, GetTasksOptions } from '../services/task.js';

const createTaskSchema = z.object({
  type: z.enum(['AI_TASK', 'RESEARCH_TASK', 'MEMORY_TASK', 'NOTIFICATION_TASK', 'MAINTENANCE_TASK']),
  payload: z.record(z.unknown()).optional(),
});

export default async function tasksRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  // GET /api/tasks - list user's background tasks
  fastify.get('/', async (request, reply) => {
    const userId = request.user!.id;
    const query = (request.query as { status?: string; type?: string; limit?: string; offset?: string }) || {};

    try {
      const options: GetTasksOptions = {};
      if (query.status) options.status = query.status;
      if (query.type) options.type = query.type;
      if (query.limit) options.limit = parseInt(query.limit, 10);
      if (query.offset) options.offset = parseInt(query.offset, 10);

      const result = await taskService.getTasks(userId, options);
      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tasks' },
      });
    }
  });

  // POST /api/tasks - create background task
  fastify.post('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const data = createTaskSchema.parse(request.body);
      const task = await taskService.createTask(userId, {
        type: data.type,
        ...(data.payload !== undefined ? { payload: data.payload } : {}),
      });

      return reply.status(201).send(task);
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
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create task' },
      });
    }
  });

  // GET /api/tasks/:id - get specific task
  fastify.get('/:id', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const taskId = parseInt(id, 10);

    if (isNaN(taskId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid task ID' } });
    }

    try {
      const task = await taskService.getTaskById(userId, taskId);
      return reply.send(task);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch task' },
      });
    }
  });

  // POST /api/tasks/:id/cancel - cancel task
  fastify.post('/:id/cancel', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const taskId = parseInt(id, 10);

    if (isNaN(taskId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid task ID' } });
    }

    try {
      const task = await taskService.cancelTask(userId, taskId);
      return reply.send(task);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to cancel task' },
      });
    }
  });

  // POST /api/tasks/:id/retry - retry failed/cancelled task
  fastify.post('/:id/retry', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const taskId = parseInt(id, 10);

    if (isNaN(taskId)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ID', message: 'Invalid task ID' } });
    }

    try {
      const task = await taskService.retryTask(userId, taskId);
      return reply.send(task);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to retry task' },
      });
    }
  });
}
