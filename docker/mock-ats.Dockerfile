# syntax=docker/dockerfile:1
# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mock-ats/package.json ./apps/mock-ats/

RUN pnpm install --frozen-lockfile --filter @autoapply/mock-ats

COPY apps/mock-ats ./apps/mock-ats

# Compile TypeScript to JS
RUN pnpm --filter @autoapply/mock-ats run build

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

# Copy only compiled output + runtime deps
COPY --from=builder /app/apps/mock-ats/dist ./dist
COPY --from=builder /app/apps/mock-ats/node_modules ./node_modules
COPY --from=builder /app/apps/mock-ats/package.json ./package.json

EXPOSE 4000

ENV MOCK_ATS_PORT=4000 \
    MOCK_ATS_HOST=0.0.0.0 \
    MOCK_ATS_CAPTCHA=random

RUN addgroup -S mockats && adduser -S mockats -G mockats
USER mockats

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
