FROM node:22-bullseye
WORKDIR /app
RUN npm install -g pnpm@9.0.0
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter web build || true
EXPOSE 5173
USER node
