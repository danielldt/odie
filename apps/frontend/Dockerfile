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

# Remove default nginx config and create templates directory
RUN rm /etc/nginx/conf.d/default.conf && mkdir -p /etc/nginx/templates

# Create nginx config template (PORT will be substituted at runtime)
RUN printf 'server {\n\
    listen $PORT;\n\
    server_name localhost;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;\n\
    location /assets/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/templates/default.conf.template

# Default port (Railway will override this)
ENV PORT=3000

# nginx:alpine auto-substitutes env vars in /etc/nginx/templates/*.template files
CMD ["nginx", "-g", "daemon off;"]
