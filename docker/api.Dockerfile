FROM node:22-bullseye
WORKDIR /app
RUN npm install -g pnpm@9.0.0
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY prisma/ ./prisma/
RUN pnpm install --no-frozen-lockfile
EXPOSE 3000
