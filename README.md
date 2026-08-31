# AUTOAPPLY — Autonomous AI Job Application Platform

## Phase 1 — Foundation

This is the foundational phase of the AutoApply platform.

### Quick Start

```bash
pnpm install
docker compose up
```

### Folder Structure

- `apps/web/` - React frontend (Vite + TS + Tailwind)
- `apps/api/` - Fastify API backend
- `packages/config/` - Shared environment configuration (Zod)
- `packages/database/` - Prisma database client
- `packages/queue/` - Redis + BullMQ wrappers
- `packages/shared/` - Shared utilities and types
- `workers/` - Background processors (Discovery, Analysis, Resume, Application, Verification)
