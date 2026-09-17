# Safe Tools & Execution Model

## 1. Separation of GENERATE from ACT
A core security principle of the Personal AI Agent platform is the strict separation between **content generation** and **real-world action**:

- **Generating**: The agent can freely compose code, generate text, calculate arithmetic, format JSON, draft emails, and extract insights without risk of unintentional side effects.
- **Acting**: Real-world operations (such as sending an email over SMTP or triggering an irreversible database operation) require explicit human consent or an asynchronous background task with bounded verification.

---

## 2. Tool Architecture
All tools conform to the `AgentTool` interface in `apps/api/src/services/tools/types.ts`:

```typescript
export interface AgentTool<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<TInput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult>;
}
```

### Tool Execution Flow
1. **Schema Validation**: Inputs are validated against the tool's Zod schema. Invalid parameters return structured errors immediately without executing logic.
2. **Timeout Enforcement**: Every tool execution is wrapped with `Promise.race` against a 15-second timeout, preventing hanging threads.
3. **Audit Logging**: Successful and failed tool executions are recorded in the `AuditLog` table with user ID, execution timestamp, and outcome.

---

## 3. Registered Safe Tools

### 1. `calculator`
- **Purpose**: Safely evaluates mathematical and arithmetic expressions without `eval()` or dangerous JavaScript execution.
- **Implementation**: Shunting-yard algorithm with explicit AST operator evaluation (`+`, `-`, `*`, `/`, `%`, `^`, `()`).
- **Security**: Disallows alphabetic identifiers, global objects, and code injection tokens.

### 2. `datetime`
- **Purpose**: Retrieves current ISO timestamps, localized dates, and timezone offsets.
- **Input**: `{ timezone?: string }`.

### 3. `text_utilities`
- **Purpose**: Text analysis, word counting, reading time calculation, slugification, and keyword frequency extraction.
- **Actions**: `stats`, `slugify`, `truncate`, `extract_keywords`.

### 4. `json_utilities`
- **Purpose**: JSON validation, pretty-formatting, minification, and key extraction.
- **Actions**: `validate`, `format`, `minify`, `extract_keys`.

### 5. `code_helper`
- **Purpose**: Validates syntax, detects indentation conventions, and formats scripts safely.
- **Languages**: `typescript`, `javascript`, `python`, `json`, `sql`, `markdown`.

### 6. `web_research`
- **Purpose**: Technical synthesis, concept explanation, and reference structuring for technical questions.

### 7. Internal System Tools
- `memory_search`: Search user's memory vault directly.
- `profile_lookup`: Inspect user's preferences, bio, and identity.
- `conversation_search`: Search previous chat messages across conversations.
