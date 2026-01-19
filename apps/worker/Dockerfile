FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/polymarket-client/package.json ./packages/polymarket-client/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --no-frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/polymarket-client/node_modules ./packages/polymarket-client/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY . .
RUN pnpm --filter @odie/shared build && \
    pnpm --filter @odie/db build && \
    pnpm --filter @odie/polymarket-client build && \
    pnpm --filter @odie/worker build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/polymarket-client/dist ./packages/polymarket-client/dist
COPY --from=builder /app/packages/polymarket-client/package.json ./packages/polymarket-client/
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/

COPY package.json pnpm-workspace.yaml ./
RUN pnpm install --prod --no-frozen-lockfile

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
