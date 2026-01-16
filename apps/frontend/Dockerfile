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

# Production - serve with nginx
FROM nginx:alpine AS runner

# Copy built files
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Create nginx config directly (avoiding template issues)
RUN echo 'server { \
    listen 3000; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript; \
    location /assets/ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Railway provides PORT dynamically - nginx will use 3000, Railway maps it
ENV PORT=3000
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
