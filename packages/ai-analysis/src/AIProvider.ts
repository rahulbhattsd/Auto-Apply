import { z } from 'zod';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}

export interface AIProvider {
  name: string;
  generateResponse(messages: ChatMessage[], options?: AIOptions): Promise<string>;
  streamResponse?(messages: ChatMessage[], options?: AIOptions, onChunk?: (chunk: string) => void): Promise<string>;
  generateStructuredOutput<T>(messages: ChatMessage[], schema: z.ZodSchema<T>, options?: AIOptions): Promise<T>;
}
