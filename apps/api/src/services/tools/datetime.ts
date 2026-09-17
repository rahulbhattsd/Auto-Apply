import { z } from 'zod';
import { AgentTool, ToolContext, ToolResult } from './types.js';

const inputSchema = z.object({
  timezone: z.string().optional().describe('Target timezone, e.g. "America/New_York", "UTC", "Asia/Kolkata". Defaults to user preference or UTC.'),
});

export const datetimeTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: 'datetime',
  description: 'Get current date, time, day of the week, and formatted timestamps in a specified timezone.',
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, context: ToolContext): Promise<ToolResult> {
    const tz = input.timezone || context.userProfile?.timezone || 'UTC';
    const now = new Date();

    try {
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(now);

      return {
        toolName: 'datetime',
        success: true,
        data: {
          iso: now.toISOString(),
          formatted,
          timezone: tz,
          unixTimestamp: Math.floor(now.getTime() / 1000),
        },
      };
    } catch {
      // Fallback if invalid timezone passed
      return {
        toolName: 'datetime',
        success: true,
        data: {
          iso: now.toISOString(),
          formatted: now.toUTCString(),
          timezone: 'UTC',
          unixTimestamp: Math.floor(now.getTime() / 1000),
          warning: `Timezone "${tz}" was invalid, reverted to UTC.`,
        },
      };
    }
  },
};
