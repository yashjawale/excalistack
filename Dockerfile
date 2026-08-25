# ---------------------------------------------------------------------------
# Build stage: install all workspace dependencies and compile every package.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /repo

RUN corepack enable

# Copy manifests first so dependency installation layers cache well.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Copy sources and build: shared -> server -> web (topological).
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm --filter @excalistack/shared build \
  && pnpm --filter @excalistack/server build \
  && pnpm --filter @excalistack/web build

# Produce a self-contained production deployment of the server package
# (server dist + shared workspace package + pruned node_modules).
RUN pnpm --filter @excalistack/server deploy --prod --legacy /out

# ---------------------------------------------------------------------------
# Runtime stage: minimal image serving the API, MCP-ready server process,
# and the prebuilt SPA from a single port.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    WEB_DIST_DIR=/app/public

WORKDIR /app
RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=build --chown=node:node /out /app
COPY --from=build --chown=node:node /repo/apps/web/dist /app/public

USER node
VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "dist/index.js"]
