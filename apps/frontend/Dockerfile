FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY . .
RUN pnpm --filter @odie/shared build
RUN pnpm --filter @odie/frontend build

# Production - simple Node.js static server
FROM node:20-alpine AS runner
WORKDIR /app

# Install serve globally
RUN npm install -g serve

# Copy built files
COPY --from=builder /app/apps/frontend/dist ./dist

# Create start script that properly reads PORT
RUN printf '#!/bin/sh\nexec serve -s dist -p "${PORT:-3000}"\n' > /start.sh && chmod +x /start.sh

# Default port (Railway provides PORT)
ENV PORT=3000
EXPOSE 3000

CMD ["/start.sh"]
