# Personal AI Agent Platform

> Production-ready, independent, continuously running Personal AI Agent platform with persistent memory, safe allowlisted tools, background task processing, and self-healing supervision.

---

## 1. Architectural Highlights

- **Autonomous Digital Partner**: Maintains conversational context, remembers verified user facts, personal preferences, project architecture, and behavioral guidelines across sessions.
- **Memory Vault**: Structured memory store (`PROFILE`, `PREFERENCE`, `PROJECT`, `FACT`, `INSTRUCTION`, `CONTEXT`) with dynamic relevance ranking and star-rated importance scoring.
- **Safe Tool Execution (Separation of GENERATE from ACT)**: Allowlisted computational and data transformation tools (`calculator`, `datetime`, `text_utilities`, `json_utilities`, `code_helper`, `web_research`). Generates drafted content safely without unauthorized real-world execution.
- **Background Task Processing**: Asynchronous job handling powered by **BullMQ** and **Redis 7** (`agent-tasks` and `notifications` queues) with bounded retries, exponential backoff, and dead-letter queue (DLQ) logging.
- **Worker Supervisor & Resilience**: Self-healing supervisor with circuit-breaker protection, heartbeat monitoring (`worker:heartbeat:...`), crash telemetry, and graceful shutdown.
- **Multi-Tenant User Isolation**: Strict ownership checks across all database models (`User`, `UserProfile`, `Conversation`, `Message`, `Memory`, `Task`, `DeadLetter`, `AuditLog`). User context is derived strictly from signed `httpOnly` JWT cookies.
- **Pluggable AI Backend**: Operates seamlessly with **Groq** (`llama-3.3-70b-versatile`) for production or zero-dependency **MockAIProvider** for offline local development and automated testing.
- **Modern Web Interface**: Clean, responsive single-page application built with React 18, Vite, Tailwind CSS, and TanStack React Query (`/dashboard`, `/chat`, `/memory`, `/tasks`, `/settings`).

---

## 2. Monorepo Structure

```
├── apps/
│   ├── api/                   # Fastify 5 + TypeScript backend server
│   │   ├── src/routes/        # Auth, Profile, Chat, Memory, Tasks, Dashboard, System, Metrics
│   │   ├── src/services/      # Orchestrator, MemoryService, TaskService, ToolRegistry
│   │   └── tests/             # Comprehensive Node.js test suites
│   └── web/                   # React 18 + Vite frontend
│       ├── src/pages/         # Dashboard, ChatPage, MemoryPage, TasksPage, SettingsPage
│       └── src/components/    # Responsive navigation sidebar & layout
├── packages/
│   ├── ai-analysis/           # AI Provider interface, GroqProvider, MockAIProvider
│   ├── config/                # Central Zod schema validation for environment variables
│   ├── database/              # Prisma client and PostgreSQL schema
│   ├── queue/                 # BullMQ queues, workers, telemetry, and heartbeats
│   ├── shared/                # Unified application errors and shared types
│   ├── eslint-config/         # Monorepo linting configurations
│   └── typescript-config/     # Base tsconfig presets
├── workers/
│   ├── task-worker/           # Background task consumer (AI_TASK, RESEARCH_TASK, etc.)
│   └── notification-worker/   # Alert delivery & notification processor
├── scripts/
│   └── start-workers.cjs      # Self-healing supervisor with circuit breaker
└── prisma/
    ├── schema.prisma          # Database schema definition
    └── migrations/            # Versioned SQL migrations
```

---

## 3. Quickstart Guide

### Prerequisites
- **Node.js**: `v20+` or `v22+ LTS`
- **pnpm**: `v9.0.0` (`corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- **PostgreSQL 15+** & **Redis 7+** (or Docker Desktop)

### 1. Clone & Install
```bash
git clone https://github.com/rahulbhattsd/Auto-Apply.git
cd Auto-Apply
pnpm install
```

### 2. Environment Configuration
Copy the example environment file:
```bash
cp .env.example .env
```
Default configuration values run in offline simulation mode (`AI_PROVIDER="mock"`):
```env
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/autoapply?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="dev-super-secret-jwt-key-at-least-32-chars-long"
APP_URL="http://localhost:5173"
API_URL="http://localhost:3000/api"
AI_PROVIDER="mock"
```

To enable live Groq inference, set:
```env
AI_PROVIDER="groq"
GROQ_API_KEY="gsk_your_groq_api_key_here"
GROQ_MODEL="llama-3.3-70b-versatile"
```

### 3. Database Migration
```bash
pnpm db:generate
pnpm db:migrate
```

### 4. Start Development Stack
In separate terminal tabs or background processes:

```bash
# Start API (http://localhost:3000)
pnpm --filter @autoapply/api dev

# Start Frontend (http://localhost:5173)
pnpm --filter @autoapply/web dev

# Start Background Workers via Supervisor
pnpm start:workers
```

Or start the entire stack via Docker:
```bash
docker compose up -d
```

---

## 4. Verification & Testing

```bash
# Run full monorepo build across all 11 packages
pnpm run build

# Typecheck all packages
pnpm run typecheck

# Run built-in tool suite tests
npx tsx --test apps/api/tests/tools.test.ts

# Run AI provider tests
npx tsx --test packages/ai-analysis/tests/AIProvider.test.ts

# Run prompt injection defense tests
npx tsx --test packages/ai-analysis/tests/PromptInjection.test.ts

# Run full API test suite (requires active DB & Redis)
pnpm --filter @autoapply/api test
```

---

## 5. API Endpoints Overview

| Area | Method | Endpoint | Description |
|---|---|---|---|
| **Auth** | `POST` | `/api/auth/register` | User signup with httpOnly JWT cookie |
| | `POST` | `/api/auth/login` | User login |
| | `GET` | `/api/auth/me` | Fetch authenticated user |
| | `POST` | `/api/auth/logout` | Invalidate session |
| **Profile** | `GET` | `/api/profile` | Retrieve user profile & agent preferences |
| | `PUT` | `/api/profile` | Update persona context & directives |
| **Chat** | `GET` | `/api/chat/conversations` | List conversation threads |
| | `POST` | `/api/chat/conversations` | Create conversation |
| | `GET` | `/api/chat/conversations/:id`| Get conversation history |
| | `POST` | `/api/chat/conversations/:id/messages` | Send message & orchestrate response |
| | `PATCH`| `/api/chat/conversations/:id`| Rename conversation |
| | `DELETE`| `/api/chat/conversations/:id`| Delete conversation |
| **Memory** | `GET` | `/api/memory` | Search & filter memory vault |
| | `POST` | `/api/memory` | Store explicit memory |
| | `PATCH`| `/api/memory/:id` | Update memory content & importance |
| | `DELETE`| `/api/memory/:id` | Delete memory item |
| **Tasks** | `GET` | `/api/tasks` | List background jobs with status filter |
| | `POST` | `/api/tasks` | Queue asynchronous agent task |
| | `GET` | `/api/tasks/:id` | Inspect task payload & results |
| | `POST` | `/api/tasks/:id/cancel`| Cancel queued task |
| | `POST` | `/api/tasks/:id/retry` | Retry failed or cancelled task |
| **System** | `GET` | `/api/dashboard` | Aggregated dashboard telemetry |
| | `GET` | `/api/system/status` | System health & AI provider state |
| | `GET` | `/api/system/workers` | Active worker heartbeats from Redis |
| | `GET` | `/metrics` | Prometheus metrics scrape target |
| | `GET` | `/api/events` | Real-time Server-Sent Events (SSE) stream |

---

## 6. Production Deployment

### Container Deployment (`docker-compose.prod.yml`)
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Render.com Blueprint (`render.yaml`)
Deploy instantly to Render.com with the included multi-service blueprint:
1. `autoapply`: Web service running Fastify API + static React frontend bundle (`SERVE_WEB=true`).
2. `autoapply-worker`: Background worker service running `scripts/start-workers.cjs`.
3. `autoapply-db`: Managed PostgreSQL database.
4. `autoapply-redis`: Managed Redis key-value instance for BullMQ.

---

## 7. Documentation Index
- [System Architecture](docs/architecture.md)
- [AI Provider & Orchestration](docs/ai.md)
- [Authentication & User Isolation](docs/authentication.md)
- [Memory Vault Design](docs/memory.md)
- [Safe Tools & Execution Model](docs/tools.md)
- [Task Queues & Dead-Letter Handling](docs/queues.md)
- [Worker Supervisor & Heartbeats](docs/workers.md)
- [Observability & Telemetry](docs/observability.md)
- [Security & Threat Modeling](docs/security.md)
- [Deployment Guide](docs/deployment.md)
- [Database Schema & Models](docs/database.md)
- [Troubleshooting Runbook](docs/troubleshooting.md)
