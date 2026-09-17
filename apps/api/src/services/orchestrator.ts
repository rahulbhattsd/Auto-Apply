import { prisma } from '@autoapply/database';
import { getAIProvider, ChatMessage, AIProvider } from '@autoapply/ai-analysis';
import { memoryService } from './memory.js';
import { defaultToolRegistry, ToolRegistry } from './tools/index.js';
import { AgentExecutionError } from '@autoapply/shared';

export interface ProcessMessageOptions {
  conversationId: number;
  userId: number;
  userMessage: string;
  aiProviderOverride?: AIProvider;
}

export interface OrchestrationResult {
  messageId: number;
  conversationId: number;
  role: 'ASSISTANT';
  content: string;
  toolsUsed?: string[];
  memoriesRetrieved?: number;
}

export class AgentOrchestrator {
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry = defaultToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async processMessage(options: ProcessMessageOptions): Promise<OrchestrationResult> {
    const { conversationId, userId, userMessage, aiProviderOverride } = options;

    // 1. Verify conversation ownership
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 15,
        },
      },
    });

    if (!conversation) {
      throw new AgentExecutionError(`Conversation ${conversationId} not found`);
    }

    if (conversation.userId !== userId) {
      throw new AgentExecutionError('Forbidden: Access denied to conversation');
    }

    // 2. Load User Profile
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    // 3. Save User Message
    await prisma.message.create({
      data: {
        conversationId,
        role: 'USER',
        content: userMessage,
      },
    });

    // 4. Retrieve Relevant Memories
    const relevantMemories = await memoryService.retrieveRelevantMemories(userId, userMessage, 5);

    // 5. Tool Evaluation / Execution
    const toolContext = {
      userId,
      conversationId,
      userProfile: profile
        ? {
            displayName: profile.displayName,
            bio: profile.bio,
            timezone: profile.timezone,
            preferences: profile.preferences,
          }
        : null,
    };

    const toolOutputs: Array<{ toolName: string; result: unknown; error?: string }> = [];
    const lowerMessage = userMessage.toLowerCase();

    // Intent detection for deterministic safe tools
    if (/\b(calc|calculate|\d+\s*[\+\-\*\/%^]\s*\d+)\b/i.test(userMessage)) {
      const match = userMessage.match(/[-+*/%^().0-9\s]{3,}/);
      if (match) {
        const toolRes = await this.toolRegistry.execute('calculator', { expression: match[0].trim() }, toolContext);
        if (toolRes.success) {
          toolOutputs.push({ toolName: 'calculator', result: toolRes.data });
        }
      }
    }

    if (/\b(what\s+time|current\s+time|today'?s\s+date|what\s+day)\b/i.test(lowerMessage)) {
      const toolRes = await this.toolRegistry.execute('datetime', {}, toolContext);
      if (toolRes.success) {
        toolOutputs.push({ toolName: 'datetime', result: toolRes.data });
      }
    }

    if (/\b(what\s+do\s+you\s+remember|check\s+memory|my\s+notes)\b/i.test(lowerMessage)) {
      const toolRes = await this.toolRegistry.execute('memory_search', { query: userMessage }, toolContext);
      if (toolRes.success) {
        toolOutputs.push({ toolName: 'memory_search', result: toolRes.data });
      }
    }

    // 6. Build Context & System Prompt
    const systemPromptLines = [
      'You are a dedicated, intelligent, and persistent Personal AI Assistant.',
      'Your job is to assist your user with their projects, coding, career, learning, research, and planning.',
      'You maintain context across conversations and act strictly according to the user stored preferences and profile.',
    ];

    if (profile?.displayName) {
      systemPromptLines.push(`The user's preferred name is: ${profile.displayName}.`);
    }
    if (profile?.bio) {
      systemPromptLines.push(`The user's background/bio: ${profile.bio}.`);
    }
    if (profile?.timezone) {
      systemPromptLines.push(`The user's timezone is: ${profile.timezone}.`);
    }

    if (relevantMemories.length > 0) {
      systemPromptLines.push('\n[Relevant Memories Stored by User]:');
      for (const m of relevantMemories) {
        systemPromptLines.push(`- [${m.type}] ${m.key}: ${m.content} (Importance: ${m.importance})`);
      }
    }

    if (toolOutputs.length > 0) {
      systemPromptLines.push('\n[Tool Execution Results]:');
      for (const t of toolOutputs) {
        systemPromptLines.push(`- Tool: ${t.toolName}: ${JSON.stringify(t.result)}`);
      }
    }

    systemPromptLines.push(
      '\n[Behavior Guidelines & Tool Boundaries]:',
      '1. Separate GENERATE from SEND/ACT. You may draft professional emails, cover letters, and messages on the user\'s behalf, but clarify that drafts are generated for their review and will not be dispatched externally.',
      '2. Ground your reasoning strictly in the user\'s profile, stored memories, and verified tool facts.',
      '3. Do not fabricate facts, skills, credentials, or external communications.',
      '4. If the user explicitly asks you to remember something (e.g. "Remember that..."), acknowledge it and confirm you have it ready to persist in their personal memory vault.'
    );

    const fullSystemPrompt = systemPromptLines.join('\n');

    // 7. Format conversation messages (chronological order)
    const history = [...conversation.messages].reverse();
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: fullSystemPrompt },
      ...history.map(m => ({
        role: (m.role.toLowerCase() === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    // 8. Generate Response using AI Provider
    const provider = aiProviderOverride ?? getAIProvider();
    let assistantReply = '';

    try {
      assistantReply = await provider.generateResponse(chatMessages, {
        temperature: 0.7,
        timeoutMs: 30000,
      });
    } catch (aiErr: unknown) {
      console.error('[AgentOrchestrator] AI generation failed:', aiErr);
      assistantReply = `I encountered a temporary issue generating a response. (${aiErr instanceof Error ? aiErr.message : 'Timeout/Service unavailable'}). Please try again.`;
    }

    // 9. Persist Assistant Message
    const savedAssistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: assistantReply,
        metadata: {
          toolsUsed: toolOutputs.map(t => t.toolName),
          memoriesCount: relevantMemories.length,
          provider: provider.name,
        },
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      messageId: savedAssistantMessage.id,
      conversationId,
      role: 'ASSISTANT',
      content: assistantReply,
      toolsUsed: toolOutputs.map(t => t.toolName),
      memoriesRetrieved: relevantMemories.length,
    };
  }
}

export const agentOrchestrator = new AgentOrchestrator();
