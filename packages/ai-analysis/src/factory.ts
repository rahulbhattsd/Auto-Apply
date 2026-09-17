import { AIProvider } from './AIProvider.js';
import { GroqProvider } from './GroqProvider.js';
import { MockAIProvider } from './MockAIProvider.js';
import { env } from '@autoapply/config';

let cachedProvider: AIProvider | undefined;

export function getAIProvider(override?: string): AIProvider {
  const providerType = override ?? process.env['AI_PROVIDER'] ?? env.AI_PROVIDER ?? 'groq';

  if (cachedProvider && cachedProvider.name === providerType) {
    return cachedProvider;
  }

  if (providerType === 'mock' || !env.GROQ_API_KEY || env.GROQ_API_KEY.startsWith('gsk_mock_') || env.NODE_ENV === 'test') {
    cachedProvider = new MockAIProvider();
    return cachedProvider;
  }

  if (providerType === 'groq') {
    cachedProvider = new GroqProvider();
    return cachedProvider;
  }

  // Fallback to Mock if provider not supported or configured
  cachedProvider = new MockAIProvider();
  return cachedProvider;
}
