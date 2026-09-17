# Database Schema & Data Models

## 1. Overview
The database layer uses **PostgreSQL 15+** managed with **Prisma ORM**. The schema is optimized for multi-tenant isolation, memory persistence, and asynchronous task telemetry.

---

## 2. Entity Relationship Summary

```
   ┌──────────────┐ 1      1 ┌──────────────┐
   │     User     ├──────────┤  UserProfile │
   └──┬───┬───┬───┘          └──────────────┘
      │   │   │
      │ 1 │ 1 │ 1
      │   │   │
      │ * │ * │ *
      ▼   │   ▼
┌──────────────┐  │  ┌──────────────┐
│ Conversation │  │  │    Memory    │
└──┬───────────┘  │  └──────────────┘
   │ 1            │
   │ *            ▼
   ▼         ┌──────────────┐
┌──────────────┐     │     Task     │
│   Message    │     └──────────────┘
└──────────────┘
```

---

## 3. Core Models

### 1. `User` & `UserProfile`
- `User`: Base account with `email`, hashed `password`, `role` (`USER` or `ADMIN`), and `isActive` flag.
- `UserProfile`: Extended identity containing `displayName`, `bio` (user background for agent prompts), `timezone`, and structured JSON `preferences`.

### 2. `Conversation` & `Message`
- `Conversation`: Chat threads uniquely owned by `userId`. Cascades on user deletion.
- `Message`: Conversational turns with `role` (`user`, `assistant`, `system`, `tool`), `content`, and JSON `metadata` (tracking `toolsUsed`, `memoriesRetrieved`, token counts).

### 3. `Memory`
- Stores atomic knowledge items in the user's vault.
- `type`: `PROFILE`, `PREFERENCE`, `PROJECT`, `FACT`, `INSTRUCTION`, `CONTEXT`.
- `key`: Unique slug identifier per user (`@@unique([userId, key])`).
- `importance`: 1 to 5 integer rating.
- `content`: Text body.

### 4. `Task`
- Tracks asynchronous BullMQ background jobs.
- `type`: `AI_TASK`, `RESEARCH_TASK`, `MEMORY_TASK`, `NOTIFICATION_TASK`, `MAINTENANCE_TASK`.
- `status`: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- `attempts` & `maxRetries`: Bounded retry tracking.
- `payload` & `result`: JSON storage for inputs and execution outputs.

### 5. `DeadLetter` & `AuditLog`
- `DeadLetter`: Captures jobs that exhausted all retry attempts, including error messages and stack traces.
- `AuditLog`: Immutable audit trail for security events, authentication mutations, and tool executions.

---

## 4. Migrations
Database migrations are versioned under `prisma/migrations/`:
- Generate client: `pnpm db:generate`
- Apply migrations: `pnpm db:migrate`
- Create migration: `pnpm prisma migrate dev --name <migration_name>`
