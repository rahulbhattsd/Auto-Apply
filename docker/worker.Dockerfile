# syntax=docker/dockerfile:1
# Playwright's official image includes all Chromium system deps.
# Node 22 / Ubuntu Jammy base — do NOT switch to Alpine; Chromium requires glibc.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

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

# Install apt extras BEFORE switching user (must run as root)
# xvfb/vnc only needed if you want a debug VNC session in staging
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb x11vnc novnc websockify \
    && rm -rf /var/lib/apt/lists/*

# Switch to the non-root playwright user
RUN chown -R pwuser:pwuser /app
USER pwuser

CMD ["node", "scripts/start-workers.cjs"]
