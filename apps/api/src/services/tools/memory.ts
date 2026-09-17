import { z } from 'zod';
import { AgentTool, ToolContext, ToolResult } from './types.js';
import { prisma } from '@autoapply/database';

const inputSchema = z.object({
  query: z.string().optional().describe('Keyword or phrase to search for in user memories'),
  type: z.enum(['PROFILE', 'PREFERENCE', 'PROJECT', 'FACT', 'INSTRUCTION', 'CONTEXT']).optional().describe('Filter by memory type'),
  limit: z.number().optional().default(5),
});

export const memorySearchTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: 'memory_search',
  description: 'Search through the user explicit memories for remembered preferences, project notes, facts, and instructions.',
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, context: ToolContext): Promise<ToolResult> {
    const { query, type, limit } = input;

    try {
      const whereClause: {
        userId: number;
        type?: string;
        OR?: Array<{ content?: { contains: string; mode: 'insensitive' }; key?: { contains: string; mode: 'insensitive' } }>;
      } = {
        userId: context.userId,
      };

      if (type) {
        whereClause.type = type;
      }

      if (query && query.trim().length > 0) {
        whereClause.OR = [
          { content: { contains: query, mode: 'insensitive' } },
          { key: { contains: query, mode: 'insensitive' } },
        ];
      }

      const memories = await prisma.memory.findMany({
        where: whereClause,
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        select: {
          id: true,
          type: true,
          key: true,
          content: true,
          importance: true,
          updatedAt: true,
        },
      });

      return {
        toolName: 'memory_search',
        success: true,
        data: {
          memories,
          totalFound: memories.length,
        },
      };
    } catch (err: unknown) {
      return {
        toolName: 'memory_search',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
