import { z } from 'zod';

export interface ToolContext {
  userId: number;
  conversationId?: number;
  userProfile?: {
    displayName?: string | null;
    bio?: string | null;
    timezone?: string | null;
    preferences?: unknown;
  } | null;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  toolName: string;
}

export interface AgentTool<TInput = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput, any, any>;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}
