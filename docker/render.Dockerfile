FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app
RUN npm install -g pnpm@9.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps ./apps
COPY workers ./workers
COPY prisma ./prisma

ENV VITE_API_URL=/api

RUN pnpm install --frozen-lockfile
RUN pnpm run build:render
RUN mkdir -p /app/uploads && chown -R pwuser:pwuser /app

EXPOSE 10000
USER pwuser
CMD ["pnpm", "run", "start:render"]
