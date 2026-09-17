# Personal AI Agent Platform Architecture

## 1. Overview
The **Personal AI Agent Platform** is an independent, autonomous, continuously running AI system designed to act as a persistent digital partner. It maintains conversational memory, adapts to user preferences and explicit guidelines, processes background tasks reliably, and executes safe allowlisted tools without unintended external side-effects.

```
┌────────────────────────────────────────────────────────┐
│               Frontend Web Application                 │
│         (React 18 + Vite + Tailwind CSS)               │
│  /dashboard  /chat  /memory  /tasks  /settings         │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / SSE / WS (JWT Cookie)
┌───────────────────────────▼────────────────────────────┐
│                    API Service                         │
│       Fastify 5 + TypeScript + Pino Logging            │
│  - JWT Authentication & CSRF Protection                │
│  - Multi-tenant User Isolation                         │
│  - Agent Orchestrator & Tool Registry                  │
│  - Memory Vault & Relevance Retrieval                  │
│  - Prometheus Metrics & Health Monitoring              │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│     PostgreSQL + Prisma   │ │    Redis 7 + BullMQ       │
│  - Users & UserProfiles   │ │  - agent-tasks queue      │
│  - Conversations & Messages│ │  - notifications queue    │
│  - Memories (Vault)       │ │  - Worker Heartbeats      │
│  - Background Tasks       │ │  - PubSub Real-time SSE   │
│  - Audit Logs & DLQ       │ └─────────────┬─────────────┘
└───────────────────────────┘               │
                                            ▼
                              ┌───────────────────────────┐
                              │     Worker Supervisor     │
                              │ (Circuit Breaker Engine)  │
                              └──────┬─────────────┬──────┘
                                     │             │
                                     ▼             ▼
                              ┌─────────────┐ ┌─────────────┐
                              │ Task Worker │ │Notification│
                              │  (BullMQ)   │ │   Worker    │
                              └─────────────┘ └─────────────┘
```

## 2. Monorepo Organization
The codebase is structured as a pnpm + Turborepo monorepo:

- `apps/api`: Fastify API server with route handlers, orchestration engine, safe tool registry, and WebSocket/SSE real-time events.
- `apps/web`: Responsive single-page application built with React, Vite, Tailwind CSS, and TanStack React Query.
- `packages/config`: Central environment variable validation via Zod, fail-fast schema parsing, and security masking.
- `packages/database`: Prisma ORM client with PostgreSQL connection pooling and transactional utilities.
- `packages/queue`: BullMQ queue definitions, Redis connection management, job tracking, and worker heartbeat telemetry.
- `packages/shared`: Shared TypeScript types, unified error hierarchy (`ApplicationError`, `NotFoundError`, etc.), and utility functions.
- `packages/ai-analysis`: AI Provider abstraction layer (`AIProvider`, `GroqProvider`, `MockAIProvider`, `getAIProvider`).
- `workers/task-worker`: Asynchronous background task consumer (`AI_TASK`, `RESEARCH_TASK`, `MEMORY_TASK`, etc.) with bounded retries and dead-letter recording.
- `workers/notification-worker`: System notification and alert processor with worker heartbeats.
- `scripts/start-workers.cjs`: Self-healing supervisor with exponential restart backoff, circuit breaker protection, and telemetry logging to Redis.

## 3. Core Architectural Principles
1. **Multi-Tenant User Isolation**: Every database query, conversation, memory, and task execution enforces user ownership verification. User IDs are extracted exclusively from authenticated JWT sessions.
2. **Safe Tool Execution (Separation of GENERATE from ACT)**: The agent can analyze, calculate, format, research, and draft emails or code without performing unauthorized real-world side effects. Side effects require explicit task scheduling or user review.
3. **Resilience & Self-Healing**: All background workers continuously broadcast heartbeats to Redis (`worker:heartbeat:<id>`). The supervisor monitors crashes and applies exponential backoff, opening circuit breakers if crash thresholds are exceeded.
4. **Pluggable AI Backend**: The system operates against an `AIProvider` interface. In development or test environments, the system runs with `MockAIProvider`, eliminating dependencies on external API keys. In production, high-throughput inference is handled by `GroqProvider` (e.g. `llama-3.3-70b-versatile`).
