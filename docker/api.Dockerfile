FROM node:22-bullseye
WORKDIR /app
RUN npm install -g pnpm@9.0.0
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY prisma/ ./prisma/
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @autoapply/database run generate
RUN pnpm --filter api build || true
EXPOSE 3000
USER node
