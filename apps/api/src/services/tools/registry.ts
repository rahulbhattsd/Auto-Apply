import { AgentTool, ToolContext, ToolResult } from './types.js';
import { prisma } from '@autoapply/database';

export class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  getDescriptions(): string {
    return this.list()
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');
  }

  async execute(
    name: string,
    rawInput: unknown,
    context: ToolContext,
    timeoutMs = 15000
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return {
        toolName: name,
        success: false,
        error: `Tool "${name}" is not registered or allowed.`,
      };
    }

    // Validate input with Zod schema
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        toolName: name,
        success: false,
        error: `Invalid input for tool "${name}": ${parsed.error.message}`,
      };
    }

    const timeoutPromise = new Promise<ToolResult>((_, reject) => {
      setTimeout(() => reject(new Error(`Tool "${name}" execution timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      const executionPromise = tool.execute(parsed.data, context);
      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Audit log tool execution
      try {
        await prisma.auditLog.create({
          data: {
            userId: context.userId,
            action: 'TOOL_EXECUTE',
            targetType: 'Tool',
            targetId: context.conversationId ?? 0,
            metadata: {
              toolName: name,
              success: result.success,
              error: result.error,
            },
          },
        });
      } catch (logErr) {
        console.warn(`[ToolRegistry] Failed to log audit for tool ${name}:`, logErr);
      }

      return result;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        toolName: name,
        success: false,
        error: errorMessage,
      };
    }
  }
}

export const defaultToolRegistry = new ToolRegistry();
