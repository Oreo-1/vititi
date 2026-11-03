# syntax=docker/dockerfile:1

# ---- build the Svelte app --------------------------------------------------
FROM node:lts-alpine3.24 AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
# Node 25+ images no longer ship corepack, so npm is only used to bootstrap the
# pnpm version pinned in package.json's "packageManager" field.
RUN npm install -g --no-audit --no-fund "$(node -p "require('./package.json').packageManager")"
RUN pnpm install --frozen-lockfile

COPY . .

# Where the browser finds PocketBase. "/" = same origin: nginx (below) proxies
# /api and /_ to the pocketbase container, so no CORS / mixed-content issues
# and it works unchanged behind a tunnel or reverse proxy.
ARG VITE_PB_URL=/
ENV VITE_PB_URL=$VITE_PB_URL
RUN pnpm run build

# ---- serve it with nginx ---------------------------------------------------
FROM nginx:alpine3.24
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
