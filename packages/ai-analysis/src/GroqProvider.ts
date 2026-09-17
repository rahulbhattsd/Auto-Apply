import {
  AIProvider,
  ChatMessage,
  AIOptions,
} from './AIProvider.js';
import { z } from 'zod';
import Groq from 'groq-sdk';
import { env } from '@autoapply/config';

export class GroqProvider implements AIProvider {
  name = 'groq';
  private client?: Groq;

  private getClient(): Groq {
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is required for Groq AI provider');
    }

    this.client ??= new Groq({
      apiKey: env.GROQ_API_KEY,
    });

    return this.client;
  }

  async generateResponse(messages: ChatMessage[], options?: AIOptions): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? 30000;
    const model = options?.model ?? env.GROQ_MODEL;
    const temperature = options?.temperature ?? 0.7;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Groq AI request timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const callPromise = (async () => {
      const formatted = messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));

      const res = await this.getClient().chat.completions.create({
        model,
        messages: formatted,
        temperature,
        ...(options?.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      });

      const content = res.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content returned from Groq');
      }
      return content;
    })();

    return Promise.race([callPromise, timeoutPromise]);
  }

  async streamResponse(
    messages: ChatMessage[],
    options?: AIOptions,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? 45000;
    const model = options?.model ?? env.GROQ_MODEL;
    const temperature = options?.temperature ?? 0.7;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Groq AI streaming timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const streamPromise = (async () => {
      const formatted = messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));

      const stream = await this.getClient().chat.completions.create({
        model,
        messages: formatted,
        temperature,
        stream: true,
      });

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          if (onChunk) onChunk(delta);
        }
      }
      return fullText;
    })();

    return Promise.race([streamPromise, timeoutPromise]);
  }

  async generateStructuredOutput<T>(
    messages: ChatMessage[],
    schema: z.ZodSchema<T>,
    options?: AIOptions
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? 30000;
    const model = options?.model ?? env.GROQ_MODEL;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Groq structured output timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const callPromise = (async () => {
      const formatted = messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));

      const res = await this.getClient().chat.completions.create({
        model,
        messages: formatted,
        temperature: options?.temperature ?? 0,
        response_format: { type: 'json_object' },
      });

      const content = res.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content returned from Groq for structured output');
      }

      const parsed = JSON.parse(content);
      return schema.parse(parsed);
    })();

    return Promise.race([callPromise, timeoutPromise]);
  }
}
