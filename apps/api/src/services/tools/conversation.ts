import { z } from 'zod';
import { AgentTool, ToolContext, ToolResult } from './types.js';
import { prisma } from '@autoapply/database';

const inputSchema = z.object({
  query: z.string().min(1).describe('Text query to search in past conversation history'),
  limit: z.number().optional().default(5),
});

export const conversationSearchTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: 'conversation_search',
  description: 'Search past conversation messages and history for the authenticated user.',
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const messages = await prisma.message.findMany({
        where: {
          conversation: {
            userId: context.userId,
          },
          content: {
            contains: input.query,
            mode: 'insensitive',
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          conversationId: true,
          role: true,
          content: true,
          createdAt: true,
          conversation: {
            select: { title: true },
          },
        },
      });

      return {
        toolName: 'conversation_search',
        success: true,
        data: {
          messages: messages.map(m => ({
            id: m.id,
            conversationTitle: m.conversation.title,
            role: m.role,
            snippet: m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content,
            createdAt: m.createdAt,
          })),
          totalFound: messages.length,
        },
      };
    } catch (err: unknown) {
      return {
        toolName: 'conversation_search',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
