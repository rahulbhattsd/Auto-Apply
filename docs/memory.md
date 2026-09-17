# Memory Vault Architecture

## 1. Overview
The **Memory Vault** provides persistent, structured recall for the Personal AI Agent. It enables the assistant to remember verified user facts, personal preferences, project architecture, behavioral instructions, and contextual notes across conversations.

---

## 2. Memory Taxonomy
Each memory is classified into one of six distinct categories:

| Type | Purpose | Example |
|---|---|---|
| `PROFILE` | Identity, roles, location, bio | "Works as Lead Software Architect in Pune, India" |
| `PREFERENCE` | Coding conventions, formatting, habits | "Prefers TypeScript with strict mode and concise replies" |
| `PROJECT` | Active codebases, dependencies, milestones | "Working on Auto-Apply personal AI agent migration" |
| `FACT` | Immutable or verified factual statements | "Redis instance runs on port 6379" |
| `INSTRUCTION` | Explicit behavioral rules for the agent | "Never execute external actions without explicit confirmation" |
| `CONTEXT` | General operational background | "Deployment runs on Render.com with Docker multi-stage builds" |

---

## 3. Storage Model (Prisma)
```prisma
model Memory {
  id          Int        @id @default(autoincrement())
  userId      Int
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        MemoryType @default(FACT)
  key         String     @db.VarChar(100)
  content     String     @db.Text
  importance  Int        @default(1)
  metadata    Json?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@unique([userId, key])
  @@index([userId, type])
  @@map("memories")
}
```

---

## 4. Retrieval Algorithm
When the user sends a message, `MemoryService.retrieveRelevantMemories` calculates relevance through a multi-factor scoring function:

1. **Keyword Overlap**:
   - Sanitizes and extracts alphanumeric tokens from the user's message.
   - Computes term frequency across memory keys, content, and metadata tags.
2. **Category Weighting**:
   - `INSTRUCTION` and `PREFERENCE` receive base multipliers to ensure behavioral rules are always prioritized.
3. **Importance Scaling**:
   - Scaled proportionally by the memory's assigned importance rating (1 to 5 stars).
4. **Recency**:
   - Memories updated more recently receive slight recency boosts.
5. **Top-K Selection**:
   - The top 5 to 10 most relevant items are selected and injected into the orchestrator's context window.

---

## 5. API Reference
- `GET /api/memory`: List memories with optional `?type=`, `?q=`, `?limit=`, and `?offset=`.
- `POST /api/memory`: Store an explicit memory (`type`, `key`, `content`, `importance`).
- `GET /api/memory/:id`: Retrieve single memory by ID.
- `PATCH /api/memory/:id`: Update memory content, type, key, or importance.
- `DELETE /api/memory/:id`: Permanently remove a memory item.
