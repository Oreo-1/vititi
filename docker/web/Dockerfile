# syntax=docker/dockerfile:1

# ---- build the Svelte app --------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Where the browser finds PocketBase. "/" = same origin: nginx (below) proxies
# /api and /_ to the pocketbase container, so no CORS / mixed-content issues
# and it works unchanged behind a tunnel or reverse proxy.
ARG VITE_PB_URL=/
ENV VITE_PB_URL=$VITE_PB_URL
RUN npm run build

# ---- serve it with nginx ---------------------------------------------------
FROM nginx:1.27-alpine
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
