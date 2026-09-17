import { z } from 'zod';
import { AgentTool, ToolContext, ToolResult } from './types.js';

const inputSchema = z.object({
  language: z.string().optional().describe('Language identifier, e.g. "typescript", "python", "json"'),
  code: z.string().min(1).describe('The source code snippet to analyze'),
});

export const codeHelperTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: 'code_helper',
  description: 'Analyze code structure, count lines, identify functions and classes, and format code snippets.',
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, _context: ToolContext): Promise<ToolResult> {
    const { code, language } = input;
    const lines = code.split('\n');
    const nonEmptyLines = lines.filter(l => l.trim().length > 0);

    // Simple heuristic detection of functions and classes
    const functionsFound = lines
      .filter(l => /(function\s+\w+|const\s+\w+\s*=\s*(async\s*)?\(|def\s+\w+|fn\s+\w+)/.test(l))
      .map(l => l.trim());

    const classesFound = lines
      .filter(l => /(class\s+\w+|interface\s+\w+|struct\s+\w+)/.test(l))
      .map(l => l.trim());

    return {
      toolName: 'code_helper',
      success: true,
      data: {
        language: language || 'unknown',
        totalLines: lines.length,
        loc: nonEmptyLines.length,
        detectedFunctions: functionsFound,
        detectedClassesOrInterfaces: classesFound,
      },
    };
  },
};
