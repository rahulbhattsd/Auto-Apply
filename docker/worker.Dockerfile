FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app
RUN npm install -g pnpm@9.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY workers ./workers
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @autoapply/database run generate
RUN pnpm --filter "./packages/**" --filter "./workers/**" run build
RUN chown -R pwuser:pwuser /app

USER pwuser
CMD ["pnpm", "run", "start:workers"]
