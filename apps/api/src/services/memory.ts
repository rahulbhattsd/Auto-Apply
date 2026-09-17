import { prisma } from '@autoapply/database';
import { NotFoundError, ForbiddenError } from '@autoapply/shared';

export type MemoryType = 'PROFILE' | 'PREFERENCE' | 'PROJECT' | 'FACT' | 'INSTRUCTION' | 'CONTEXT';

export interface CreateMemoryInput {
  type?: MemoryType | undefined;
  key: string;
  content: string;
  metadata?: Record<string, unknown> | undefined;
  importance?: number | undefined;
}

export interface UpdateMemoryInput {
  type?: MemoryType | undefined;
  key?: string | undefined;
  content?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  importance?: number | undefined;
}

export interface GetMemoriesOptions {
  query?: string | undefined;
  type?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export class MemoryService {
  async createMemory(userId: number, input: CreateMemoryInput) {
    return prisma.memory.create({
      data: {
        userId,
        type: input.type || 'FACT',
        key: input.key.trim(),
        content: input.content.trim(),
        metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
        importance: input.importance ?? 1,
      },
    });
  }

  async getMemories(userId: number, options?: GetMemoriesOptions) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: {
      userId: number;
      type?: string;
      OR?: Array<{
        content?: { contains: string; mode: 'insensitive' };
        key?: { contains: string; mode: 'insensitive' };
      }>;
    } = { userId };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.query && options.query.trim().length > 0) {
      where.OR = [
        { content: { contains: options.query, mode: 'insensitive' } },
        { key: { contains: options.query, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.memory.findMany({
        where,
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.memory.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async getMemoryById(userId: number, id: number) {
    const memory = await prisma.memory.findUnique({ where: { id } });
    if (!memory) {
      throw new NotFoundError(`Memory with ID ${id} not found`);
    }
    if (memory.userId !== userId) {
      throw new ForbiddenError('You do not have access to this memory');
    }
    return memory;
  }

  async updateMemory(userId: number, id: number, input: UpdateMemoryInput) {
    await this.getMemoryById(userId, id); // validates existence and ownership

    return prisma.memory.update({
      where: { id },
      data: {
        ...(input.type ? { type: input.type } : {}),
        ...(input.key ? { key: input.key.trim() } : {}),
        ...(input.content ? { content: input.content.trim() } : {}),
        ...(input.metadata !== undefined
          ? { metadata: JSON.parse(JSON.stringify(input.metadata)) }
          : {}),
        ...(input.importance !== undefined ? { importance: input.importance } : {}),
      },
    });
  }

  async deleteMemory(userId: number, id: number) {
    await this.getMemoryById(userId, id); // validates existence and ownership
    await prisma.memory.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Retrieves high-relevance memories for the agent to reason over
   * based on the conversation context or query.
   */
  async retrieveRelevantMemories(userId: number, contextQuery: string, maxItems = 5) {
    // Extract meaningful words from query
    const words = contextQuery
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 10);

    const conditions: Array<{
      content?: { contains: string; mode: 'insensitive' };
      key?: { contains: string; mode: 'insensitive' };
    }> = [];

    for (const word of words) {
      conditions.push({ content: { contains: word, mode: 'insensitive' } });
      conditions.push({ key: { contains: word, mode: 'insensitive' } });
    }

    type MemoryRecord = Awaited<ReturnType<typeof prisma.memory.findMany>>[number];
    let memories: MemoryRecord[] = [];

    if (conditions.length > 0) {
      memories = await prisma.memory.findMany({
        where: {
          userId,
          OR: conditions,
        },
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: maxItems,
      });
    }

    // If no specific match, load user's top preferences & instructions
    if (memories.length === 0) {
      memories = await prisma.memory.findMany({
        where: {
          userId,
          type: { in: ['PREFERENCE', 'INSTRUCTION', 'PROFILE'] },
        },
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: maxItems,
      });
    }

    return memories;
  }
}

export const memoryService = new MemoryService();
