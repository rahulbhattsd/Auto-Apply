# Platform Security & Threat Mitigation

## 1. Security Architecture Summary
The Personal AI Agent Platform enforces defense-in-depth security principles across all layers:

1. **Authentication**: Signed `httpOnly`, `SameSite=Lax/Strict` JWT cookies.
2. **Authorization & Isolation**: User-level resource filtering on all queries (`userId` derived strictly from JWT).
3. **Cross-Site Request Forgery (CSRF)**: Strict origin and referer verification on all mutating requests.
4. **Denial of Service (DoS) Mitigation**: Tiered rate-limiting via Fastify.
5. **Prompt Injection Defense**: Structural isolation of system instructions from untrusted user content and Zod schema enforcement.
6. **Execution Sandboxing**: Prohibits arbitrary code evaluation or shell execution. Built-in tools are strictly allowlisted and mathematical operations use AST parser evaluation.

---

## 2. Threat Modeling & Defenses

### Threat 1: Prompt Injection & Jailbreaking
- **Risk**: An untrusted external text or prompt attempts to override the agent's persona, leak previous memories, or execute unauthorized operations.
- **Defense**:
  - System instructions are strictly injected into the LLM's `system` role.
  - User inputs and untrusted data are clearly wrapped in `<untrusted_input>` tags.
  - The model has no access to shell commands or arbitrary external network access.
  - The agent separates GENERATE from ACT: outputting a drafted email or script does not execute it.

### Threat 2: Multi-Tenant Data Leakage
- **Risk**: User A accesses User B's memories, private conversations, tasks, or profile.
- **Defense**:
  - No API endpoint accepts a `userId` in the body or query parameter to identify the actor. The actor's `userId` is always extracted from the cryptographic JWT session.
  - Database queries explicitly scope by `userId`:
    `prisma.memory.findUnique({ where: { id, userId } })`.
  - Comprehensive automated isolation test suite (`apps/api/tests/isolation.test.ts`) verifies that cross-user reads and writes are rejected.

### Threat 3: Secret Leakage & Environment Hygiene
- **Risk**: Secrets or credentials leaked in crash dumps, logs, or API responses.
- **Defense**:
  - Environment variables are validated on boot via `packages/config`.
  - Sensitive keys (`JWT_SECRET`, `GROQ_API_KEY`, `SMTP_PASS`, `S3_SECRET_ACCESS_KEY`) are stripped or masked in diagnostic dumps.
  - API errors return standardized application error shapes (`code`, `message`) without leaking internal database column names or stack traces to clients.
