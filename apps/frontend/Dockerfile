FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --no-frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY . .
RUN pnpm --filter @odie/shared build
RUN pnpm --filter @odie/frontend build

# Production - serve with nginx
FROM nginx:alpine AS runner

# Install envsubst
RUN apk add --no-cache gettext

# Copy built files
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Copy nginx config as template
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf.template

# Copy and setup start script (Railway looks for this)
COPY apps/frontend/docker-entrypoint.sh /start.sh
RUN chmod +x /start.sh

# Default port
ENV PORT=3000

EXPOSE 3000

CMD ["/start.sh"]
