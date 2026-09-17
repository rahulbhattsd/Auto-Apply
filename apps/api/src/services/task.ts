import { prisma } from '@autoapply/database';
import { agentTaskQueue, RETRY_POLICIES } from '@autoapply/queue';
import { NotFoundError, ForbiddenError } from '@autoapply/shared';

export interface CreateTaskOptions {
  type: 'AI_TASK' | 'RESEARCH_TASK' | 'MEMORY_TASK' | 'NOTIFICATION_TASK' | 'MAINTENANCE_TASK';
  payload?: Record<string, unknown> | undefined;
  jobId?: string | undefined;
}

export interface GetTasksOptions {
  status?: string | undefined;
  type?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export class TaskService {
  async createTask(userId: number, options: CreateTaskOptions) {
    const { type, payload } = options;

    const task = await prisma.task.create({
      data: {
        userId,
        type,
        status: 'QUEUED',
        payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
        attempts: 0,
      },
    });

    const stableJobId = options.jobId || `task-${task.id}`;

    try {
      await agentTaskQueue.add(
        type,
        {
          taskId: task.id,
          userId,
          type,
          payload: task.payload,
        },
        {
          jobId: stableJobId,
          attempts: RETRY_POLICIES.TASK_ERROR.attempts,
          backoff: RETRY_POLICIES.TASK_ERROR.backoff,
        }
      );
    } catch (queueErr) {
      console.error(`[TaskService] Failed to enqueue task ${task.id} to BullMQ:`, queueErr);
      // Even if Redis temporarily fails, task is preserved in DB with QUEUED status
    }

    return task;
  }

  async getTasks(userId: number, options?: GetTasksOptions) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: { userId: number; status?: string; type?: string } = { userId };
    if (options?.status) where.status = options.status;
    if (options?.type) where.type = options.type;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total, limit, offset };
  }

  async getTaskById(userId: number, id: number) {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }
    if (task.userId !== userId) {
      throw new ForbiddenError('You do not have access to this task');
    }
    return task;
  }

  async cancelTask(userId: number, id: number) {
    const task = await this.getTaskById(userId, id);
    if (['COMPLETED', 'CANCELLED'].includes(task.status)) {
      return task;
    }

    // Attempt to remove from queue
    try {
      const job = await agentTaskQueue.getJob(`task-${id}`);
      if (job) {
        await job.remove();
      }
    } catch {
      // Job may have already processed or not in queue
    }

    return prisma.task.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });
  }

  async retryTask(userId: number, id: number) {
    const task = await this.getTaskById(userId, id);

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: 'QUEUED',
        error: null,
        startedAt: null,
        completedAt: null,
      },
    });

    try {
      await agentTaskQueue.add(
        task.type,
        {
          taskId: task.id,
          userId,
          type: task.type,
          payload: task.payload,
        },
        {
          jobId: `task-${task.id}-retry-${Date.now()}`,
          attempts: RETRY_POLICIES.TASK_ERROR.attempts,
          backoff: RETRY_POLICIES.TASK_ERROR.backoff,
        }
      );
    } catch (err) {
      console.error(`[TaskService] Failed to re-enqueue task ${id}:`, err);
    }

    return updatedTask;
  }
}

export const taskService = new TaskService();
