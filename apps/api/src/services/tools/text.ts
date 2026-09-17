import { z } from 'zod';
import { AgentTool, ToolContext, ToolResult } from './types.js';

const inputSchema = z.object({
  action: z.enum(['stats', 'slugify', 'truncate', 'extract_keywords']),
  text: z.string().min(1),
  maxLength: z.number().optional().default(100),
});

export const textUtilsTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: 'text_utilities',
  description: 'Perform text transformations, word/character statistics, keyword extraction, and slug generation.',
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, _context: ToolContext): Promise<ToolResult> {
    const { action, text, maxLength } = input;

    switch (action) {
      case 'stats': {
        const words = text.trim().split(/\s+/).filter(Boolean);
        const lines = text.split('\n').length;
        return {
          toolName: 'text_utilities',
          success: true,
          data: {
            wordCount: words.length,
            charCount: text.length,
            lineCount: lines,
            readingTimeMinutes: Math.ceil(words.length / 200),
          },
        };
      }
      case 'slugify': {
        const slug = text
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '');
        return {
          toolName: 'text_utilities',
          success: true,
          data: { slug },
        };
      }
      case 'truncate': {
        const truncated = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
        return {
          toolName: 'text_utilities',
          success: true,
          data: { truncated },
        };
      }
      case 'extract_keywords': {
        const stopWords = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'is', 'that', 'for', 'it', 'as', 'was', 'with', 'on', 'at', 'by', 'this']);
        const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        const freq = new Map<string, number>();
        for (const w of words) {
          if (!stopWords.has(w)) {
            freq.set(w, (freq.get(w) || 0) + 1);
          }
        }
        const topKeywords = Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([keyword, count]) => ({ keyword, count }));
        return {
          toolName: 'text_utilities',
          success: true,
          data: { topKeywords },
        };
      }
    }
  },
};
