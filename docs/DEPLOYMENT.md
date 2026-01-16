# Odie Polymarket Platform - Deployment Guide

## Prerequisites

- Docker & Docker Compose v2+
- At least 2GB RAM, 10GB disk
- Domain with DNS configured (for production)

## Quick Start (Development)

```bash
# Clone and setup
git clone <repo>
cd odie-polymarket-platform
cp env.example .env

# Start infrastructure (Postgres + Redis)
docker-compose -f infra/docker/docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Run migrations
pnpm db:migrate

# Start all services in dev mode
pnpm dev
```

## Production Deployment

### 1. Configure Environment

```bash
# Copy and edit environment file
cp env.example .env

# Generate secrets
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 32  # For CREDENTIALS_MASTER_KEY
```

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - 32+ character secret for JWT signing
- `CREDENTIALS_MASTER_KEY` - Base64-encoded 32-byte key for AES encryption

### 2. Build and Deploy

```bash
# Build all images
docker-compose -f infra/docker/docker-compose.yml build

# Start services
docker-compose -f infra/docker/docker-compose.yml up -d

# Check status
docker-compose -f infra/docker/docker-compose.yml ps
docker-compose -f infra/docker/docker-compose.yml logs -f
```

### 3. Run Migrations

```bash
# Execute migrations inside api container
docker exec odie-api npm run db:migrate
```

### 4. Configure TLS (Production)

Edit `infra/docker/Caddyfile`:
```
yourdomain.com {
    tls your-email@example.com
    
    handle /* {
        reverse_proxy frontend:3000
    }
    
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy api:3001
    }
    
    handle /ws/* {
        reverse_proxy api:3001
    }
}
```

Enable Caddy:
```bash
docker-compose -f infra/docker/docker-compose.yml --profile production up -d caddy
```

## Health Checks

API health endpoint:
```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"2026-01-15T..."}
```

Service health:
```bash
docker-compose -f infra/docker/docker-compose.yml ps
docker-compose -f infra/docker/docker-compose.yml exec postgres pg_isready
docker-compose -f infra/docker/docker-compose.yml exec redis redis-cli ping
```

## Backups

### Automated Daily Backups

Add to crontab:
```bash
0 2 * * * /path/to/infra/scripts/backup-postgres.sh >> /var/log/odie-backup.log 2>&1
```

### Manual Backup

```bash
./infra/scripts/backup-postgres.sh
```

### Restore from Backup

```bash
./infra/scripts/restore-postgres.sh /var/backups/odie/odie_backup_20260115_020000.sql.gz
```

## Monitoring

### Logs

```bash
# All services
docker-compose -f infra/docker/docker-compose.yml logs -f

# Specific service
docker-compose -f infra/docker/docker-compose.yml logs -f api
docker-compose -f infra/docker/docker-compose.yml logs -f worker
```

### Metrics

The API exposes a `/health` endpoint. For Prometheus metrics, consider adding:
- `prom-client` to the API
- Grafana + Prometheus stack

## Troubleshooting

### Worker not processing jobs

1. Check Redis connection:
   ```bash
   docker exec odie-redis redis-cli ping
   ```

2. Check worker logs:
   ```bash
   docker logs odie-worker
   ```

3. Verify BullMQ queues:
   ```bash
   docker exec odie-redis redis-cli keys "bull:*"
   ```

### Database connection issues

1. Verify Postgres is running:
   ```bash
   docker exec odie-postgres pg_isready
   ```

2. Check connection string in `.env`

3. Verify network connectivity:
   ```bash
   docker network ls
   docker network inspect docker_default
   ```

### WebSocket connection drops

1. Check Caddy/nginx timeouts
2. Verify WebSocket upgrade headers
3. Check for proxy buffering issues

## Scaling (Future)

For high-availability deployment:

1. **Database**: Use managed PostgreSQL (AWS RDS, Cloud SQL)
2. **Redis**: Use managed Redis (ElastiCache, Memorystore)
3. **Workers**: Scale horizontally with multiple instances
4. **API**: Deploy behind load balancer with multiple instances
5. **WebSockets**: Use Redis pub/sub for cross-instance messaging

## Security Checklist

- [ ] Change all default passwords
- [ ] Generate strong JWT and encryption secrets
- [ ] Enable TLS with valid certificates
- [ ] Configure firewall (allow only 80/443)
- [ ] Set up automated backups
- [ ] Enable log aggregation
- [ ] Configure rate limiting
- [ ] Review CORS settings
