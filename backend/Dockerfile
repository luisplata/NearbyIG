# Build de la API de NearbyIG.
#
# El contexto es la RAÍZ del repo (no `backend/`) porque el runner de seeds lee
# `contract/catalog/*.json` y `contract/seed/manifest.json`: una sola fuente de
# verdad, cero copias. `Dockerfile.dockerignore` deja el contexto en lo mínimo.
#
# Stages:
#   deps        → node_modules con devDependencies (build y dev)
#   build       → `dist/` compilado
#   runtime-deps→ sólo dependencias de producción
#   development → imagen de `compose.dev.yml` (bind mount + watch)
#   runtime     → imagen final, usuario no-root, sin bind mounts
# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS node-base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./

FROM node-base AS deps
RUN npm ci

FROM deps AS build
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

FROM node-base AS runtime-deps
RUN npm ci --omit=dev && npm cache clean --force

FROM deps AS development
ENV NODE_ENV=development
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/sql ./sql
COPY backend/scripts ./scripts
COPY contract/catalog /seed/catalog
COPY contract/seed /seed/seed
EXPOSE 3000 9229
CMD ["sh", "-c", "npm run build && npm run start:dev"]

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/package.json ./package.json
COPY backend/sql ./sql
COPY backend/scripts ./scripts
COPY contract/catalog /seed/catalog
COPY contract/seed /seed/seed
EXPOSE 3000
# La imagen trae el usuario `node` (uid 1000): la API no corre como root.
USER node
CMD ["node", "dist/main.js"]
