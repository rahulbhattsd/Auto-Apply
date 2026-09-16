# syntax=docker/dockerfile:1
# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm via corepack (faster than npm install -g)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy workspace manifests first for layer-cached dep install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY prisma ./prisma

# Install ALL workspace deps (needed to build web + api)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @autoapply/database run generate

# Build packages (shared libs first via turbo dep order)
RUN pnpm --filter @autoapply/config... run build
RUN pnpm --filter @autoapply/api... run build

# Build frontend
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @autoapply/web run build

# Prune to production-only deps for smaller runtime image
RUN pnpm --filter @autoapply/api --prod deploy /prod/api
RUN cp -r /app/apps/web/dist /prod/web-dist

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

# Production API deps + compiled JS
COPY --from=builder /prod/api ./
# Built frontend (served by SERVE_WEB=true)
COPY --from=builder /prod/web-dist ./apps/web/dist
# Prisma schema + migrations (needed by preDeployCommand)
COPY --from=builder /app/prisma ./prisma

# ── Prisma: runtime client (generated, lives inside prod deploy) ──────────────
# @prisma/client is a prod dep so it's already in /prod/api/node_modules.
# We also need the generated .prisma/client binary which pnpm deploy doesn't copy.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# ── Prisma: CLI for preDeployCommand (prisma is a devDep → copy explicitly) ──
# Render runs `preDeployCommand` inside this container before it goes live.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

RUN mkdir -p /app/uploads && chown -R node:node /app

EXPOSE 3000
USER node

# dumb-init ensures SIGTERM propagates to Node so graceful shutdown works
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
