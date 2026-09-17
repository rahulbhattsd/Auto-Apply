# Deployment & Operations Guide

## 1. Deployment Topology

The Personal AI Agent platform can be deployed via Docker Compose for local/self-hosted infrastructure, or through managed container platforms like Render.com, Fly.io, or AWS ECS.

```
                  ┌────────────────────────┐
                  │    Reverse Proxy       │
                  │   (Nginx / Traefik)    │
                  └───────────┬────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
      ┌─────────────────┐           ┌─────────────────┐
      │  API & Web App  │           │   Supervised    │
      │  (Port 3000)    │           │ Background      │
      │                 │           │ Workers         │
      └────────┬────────┘           └────────┬────────┘
               │                             │
               └──────────────┬──────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
      ┌─────────────────┐           ┌─────────────────┐
      │  PostgreSQL 15+ │           │     Redis 7     │
      │    (Database)   │           │    (BullMQ)     │
      └─────────────────┘           └─────────────────┘
```

---

## 2. Docker Compose Deployment

### Development Environment
```bash
# Start PostgreSQL, Redis, MinIO, API, Web, and Workers
docker compose up -d

# View logs across all services
docker compose logs -f
```

### Production Environment
```bash
# Start production containers with optimized builds
docker compose -f docker-compose.prod.yml up -d
```

---

## 3. Render.com Deployment (`render.yaml`)

The platform includes a zero-configuration `render.yaml` blueprint:

1. **Web Service (`autoapply`)**:
   - Dockerfile: `./docker/api.Dockerfile`
   - Pre-deploy command: `node node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma`
   - Serves API routes on `/api/*` and pre-built React frontend static assets on `/*` (`SERVE_WEB=true`).
   - Health check path: `/api/health`.
2. **Worker Service (`autoapply-worker`)**:
   - Dockerfile: `./docker/worker.Dockerfile`
   - Command: `node scripts/start-workers.cjs`
   - Supervised execution of `@autoapply/task-worker` and `@autoapply/notification-worker`.
3. **Managed Services**:
   - PostgreSQL Database (`autoapply-db`).
   - Redis Service (`autoapply-redis`).

---

## 4. Key Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | `development`, `test`, or `production` |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `JWT_SECRET` | Yes | — | Secret key for signing session tokens (min 32 chars) |
| `AI_PROVIDER` | No | `mock` | `groq` or `mock` |
| `GROQ_API_KEY` | Optional | — | API key for Groq Cloud inference |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Model identifier for Groq |
| `APP_URL` | Yes | `http://localhost:5173` | Canonical URL of the frontend application |
| `API_URL` | Yes | `http://localhost:3000` | Canonical URL of the backend API |
| `SERVE_WEB` | No | `false` | Enable API server to serve web frontend bundle |
