# syntax=docker/dockerfile:1
# Node 22 / Ubuntu Jammy base
FROM node:22-bullseye

WORKDIR /app

# Install pnpm via corepack
RUN npm install -g pnpm@9.0.0 --loglevel=error

# Copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY workers ./workers
COPY prisma ./prisma

# Install workspace deps
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @autoapply/database run generate

# Build all worker packages
RUN pnpm --filter "./packages/**" --filter "./workers/**" run build

# Switch to a non-root user
RUN adduser --disabled-password --gecos '' pwuser && chown -R pwuser:pwuser /app
USER pwuser

CMD ["node", "scripts/start-workers.cjs"]
