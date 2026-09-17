# AI Provider & Orchestration Architecture

## 1. AI Provider Abstraction
All intelligence capabilities in the platform depend on the abstract `AIProvider` interface defined in `@autoapply/ai-analysis`:

```typescript
export interface AIProvider {
  name: string;
  generateResponse(messages: ChatMessage[], options?: AIOptions): Promise<string>;
  streamResponse(messages: ChatMessage[], options?: AIOptions, onChunk?: (chunk: string) => void): Promise<string>;
  generateStructuredOutput<T>(messages: ChatMessage[], schema: z.ZodSchema<T>, options?: AIOptions): Promise<T>;
}
```

### Supported Providers
1. **GroqProvider**:
   - Model: `llama-3.3-70b-versatile` (configurable via `GROQ_MODEL`).
   - Ultra-fast token generation suitable for interactive chat.
   - Built-in request timeout (default 30 seconds) via `AbortController` to prevent thread stalling.
   - Streaming support via native SSE chunks.
2. **MockAIProvider**:
   - Zero external dependencies; operates fully offline.
   - Used in test environments (`NODE_ENV=test`) or when `AI_PROVIDER=mock`.
   - Simulates reasoning, calculations, and structured task results.

### Factory Pattern
The active provider is instantiated via `getAIProvider()` in `packages/ai-analysis/src/factory.ts`:
- Reads `AI_PROVIDER` (`groq` or `mock`).
- Falls back safely to `MockAIProvider` if API keys are absent or unrecognized.

---

## 2. Agent Orchestration Engine
The orchestrator (`apps/api/src/services/orchestrator.ts`) coordinates user messages into coherent assistant responses:

1. **Context Loading**:
   - Loads the user's persona and configuration from `UserProfile`.
   - Retrieves active conversation history (last 10 turns).
2. **Memory Vault Retrieval**:
   - Queries `MemoryService` with the user's message to extract relevant facts, preferences, and project guidelines.
   - Ranks memories by importance and term frequency relevance.
3. **Intent & Tool Execution**:
   - Analyzes whether user prompt requires computational or allowlisted tool execution (e.g. `calculator`, `datetime`, `text_utilities`, `web_research`).
   - Executes matched tools in a sandboxed, bounded timeout wrapper.
4. **Prompt Assembly & Generation**:
   - Injects user profile, recalled memories, and tool outputs into a structured prompt.
   - Dispatches prompt to the `AIProvider`.
5. **Persistence**:
   - Persists user message and assistant reply to the `Message` table with associated execution metadata (`toolsUsed`, `memoriesRetrieved`).

---

## 3. Prompt Injection Defense
To prevent adversarial manipulation when evaluating untrusted inputs or external data:
- **Role Separation**: System prompts are strictly separated from user-provided inputs in the chat payload.
- **Structural Enforcement**: Inputs are explicitly delimited with `<untrusted_input>` tags.
- **Schema Validation**: All structured outputs are parsed through Zod schemas before consumption by backend services.
