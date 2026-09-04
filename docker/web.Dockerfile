FROM node:22-bullseye AS dev

WORKDIR /app
RUN npm install -g pnpm@9.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile
EXPOSE 5173
CMD ["pnpm", "--filter", "@autoapply/web", "dev", "--", "--host", "0.0.0.0"]

FROM node:22-bullseye AS build

WORKDIR /app
RUN npm install -g pnpm@9.0.0

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @autoapply/web run build

FROM nginx:1.27-alpine
COPY docker/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
