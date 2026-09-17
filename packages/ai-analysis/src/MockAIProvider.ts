import {
  AIProvider,
  ChatMessage,
  AIOptions,
} from './AIProvider.js';
import { z } from 'zod';

export class MockAIProvider implements AIProvider {
  name = 'mock';

  async generateResponse(messages: ChatMessage[], /* _options */ _options?: AIOptions): Promise<string> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    const lower = lastUserMessage.toLowerCase();

    if (lower.includes('calc') || lower.includes('+') || lower.includes('*')) {
      return `I evaluated that for you. The result is calculated accurately.`;
    }

    if (lower.includes('remember') || lower.includes('memory')) {
      return `I have noted and remembered that information for you.`;
    }

    if (lower.includes('email') || lower.includes('reply') || lower.includes('draft')) {
      return `Here is a professional draft tailored to your profile and preferred tone:\n\nThank you for reaching out. Based on my technical background, I would be pleased to explore potential alignment.\n\nBest regards,\nRahul`;
    }

    return `Hello! As your personal AI assistant, I am here to help you with your projects, coding, research, planning, and tasks. Based on our conversation and your preferences, here is the answer to your request:\n\n${lastUserMessage}`;
  }

  async streamResponse(
    messages: ChatMessage[],
    options?: AIOptions,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const response = await this.generateResponse(messages, options);
    const chunks = response.split(' ');
    for (const chunk of chunks) {
      if (onChunk) onChunk(chunk + ' ');
    }
    return response;
  }

  async generateStructuredOutput<T>(
    messages: ChatMessage[],
    /* _schema */ _schema: z.ZodSchema<T>,
    /* _options */ _options?: AIOptions
  ): Promise<T> {
    const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    return {
      intent: 'general_assistant',
      needsTool: false,
      summary: `Processed structured request: ${lastMsg.slice(0, 50)}`,
    } as unknown as T;
  }
}
