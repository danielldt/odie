FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/polymarket-client/package.json ./packages/polymarket-client/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/polymarket-client/node_modules ./packages/polymarket-client/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @odie/shared build && \
    pnpm --filter @odie/db build && \
    pnpm --filter @odie/polymarket-client build && \
    pnpm --filter @odie/api build

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
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Install production dependencies only
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
