# AutoApply

AutoApply is a pnpm/Turborepo monorepo for an AI-assisted job application workflow.

- Frontend: React, TypeScript, Vite
- API: Node.js, Fastify, TypeScript
- Data: PostgreSQL, Prisma
- Queues: Redis, BullMQ
- Workers: discovery, analysis, resume, application, verification, notification
- Automation/AI: Playwright, Groq

## Prerequisites

- Node.js 22 LTS or newer
- Corepack/pnpm 9
- Docker and Docker Compose for PostgreSQL, Redis, and containerized runs

Enable pnpm if needed:

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

## Environment

Create a local environment file:

```bash
cp .env.example .env
```

For local development, provide:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `APP_URL`
- `API_URL`
- `ALLOWED_ORIGINS`
- `VITE_API_URL`

Optional integrations:

- `GROQ_API_KEY` is required only for live resume/cover-letter generation.
- `SMTP_*` values are required only for live email delivery.

Do not commit real secrets.

## Local Setup

Install dependencies:

```bash
pnpm install
pnpm db:generate
```

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Apply migrations:

```bash
pnpm db:migrate
```

Start the full local system:

```bash
pnpm run dev
```

The API listens on `http://localhost:3000`.
The web app listens on `http://localhost:5173`.

Useful checks:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Health endpoints:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
```

## Docker Development

Build and start the development stack:

```bash
docker compose build
docker compose up
```

This starts PostgreSQL, Redis, API, web, all workers, and the migration service.

## Production Containers

Set production secrets in your hosting environment, not in source control:

```bash
POSTGRES_PASSWORD=replace-me
DATABASE_URL=postgresql://postgres:replace-me@postgres:5432/autoapply?schema=public
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
APP_URL=https://your-domain.example
API_URL=https://your-domain.example/api
ALLOWED_ORIGINS=https://your-domain.example
```

Then build and run:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up
```

Production exposes nginx on `${HTTP_PORT:-80}`. PostgreSQL and Redis stay on the internal Docker network.

## Notes

- Browser automation is handled by the application worker and uses Playwright Chromium.
- Missing `GROQ_API_KEY` does not prevent the API or workers from starting, but live AI generation jobs fail clearly when they try to call Groq.
- CAPTCHA, MFA, unsupported ATS flows, or missing submit confirmation move applications to `NEEDS_HUMAN` instead of pretending submission succeeded.
