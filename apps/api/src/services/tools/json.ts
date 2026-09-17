import { z } from 'zod';
import { AgentTool, ToolContext, ToolResult } from './types.js';

const inputSchema = z.object({
  action: z.enum(['validate', 'format', 'minify', 'extract_keys']),
  jsonString: z.string().min(1),
});

export const jsonUtilsTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: 'json_utilities',
  description: 'Validate, format, minify, and extract keys from JSON strings safely.',
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, _context: ToolContext): Promise<ToolResult> {
    try {
      const parsed = JSON.parse(input.jsonString);

      switch (input.action) {
        case 'validate':
          return {
            toolName: 'json_utilities',
            success: true,
            data: { valid: true, type: Array.isArray(parsed) ? 'array' : typeof parsed },
          };
        case 'format':
          return {
            toolName: 'json_utilities',
            success: true,
            data: { formatted: JSON.stringify(parsed, null, 2) },
          };
        case 'minify':
          return {
            toolName: 'json_utilities',
            success: true,
            data: { minified: JSON.stringify(parsed) },
          };
        case 'extract_keys': {
          const keys = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [];
          return {
            toolName: 'json_utilities',
            success: true,
            data: { keys, totalKeys: keys.length },
          };
        }
      }
    } catch (err: unknown) {
      return {
        toolName: 'json_utilities',
        success: false,
        error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
