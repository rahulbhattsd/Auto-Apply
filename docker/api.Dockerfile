FROM node:22-bullseye

WORKDIR /app
RUN npm install -g pnpm@9.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @autoapply/database run generate
RUN pnpm --filter @autoapply/api... run build
RUN mkdir -p /app/uploads && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["pnpm", "--filter", "@autoapply/api", "start"]
