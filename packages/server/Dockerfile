# Build context is the repo root (npm workspace monorepo) — see docker-compose.yml.
# packages/server depends on packages/shared via the workspace symlink, not a published package,
# so both must be present in the build context.

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/api/package.json packages/api/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN npm run build --workspace=@arena/shared --workspace=@arena/server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/api/package.json packages/api/package.json
RUN npm ci --omit=dev --workspace=@arena/shared --workspace=@arena/server

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist

WORKDIR /app/packages/server
CMD ["node", "dist/index.js"]
