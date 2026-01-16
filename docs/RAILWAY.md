# Deploy to Railway

## Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/odie-polymarket.git
git push -u origin main
```

## Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository

## Step 3: Add PostgreSQL

1. Click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway auto-creates `DATABASE_URL` variable

## Step 4: Add Redis

1. Click **"+ New"** → **"Database"** → **"Redis"**
2. Railway auto-creates `REDIS_URL` variable

## Step 5: Deploy API Service

1. Click **"+ New"** → **"GitHub Repo"** → Select your repo
2. Configure:
   - **Root Directory**: `apps/api`
   - **Start Command**: `node dist/index.js`
3. Add environment variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   JWT_SECRET=<generate-32-char-secret>
   CREDENTIALS_MASTER_KEY=<generate-base64-32-bytes>
   API_PORT=3001
   API_HOST=0.0.0.0
   FRONTEND_URL=https://your-frontend.up.railway.app
   ```
4. Railway will auto-detect Dockerfile and build

## Step 6: Deploy Worker Service

1. Click **"+ New"** → **"GitHub Repo"** → Select your repo
2. Configure:
   - **Root Directory**: `apps/worker`
   - **Start Command**: `node dist/index.js`
3. Add environment variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   CREDENTIALS_MASTER_KEY=<same-as-api>
   WORKER_CONCURRENCY=5
   ```

## Step 7: Deploy Frontend Service

1. Click **"+ New"** → **"GitHub Repo"** → Select your repo
2. Configure:
   - **Root Directory**: `apps/frontend`
3. Add environment variables:
   ```
   VITE_API_URL=https://your-api.up.railway.app
   ```

## Step 8: Configure Networking

1. Click on **API service** → **Settings** → **Networking**
2. Click **"Generate Domain"** (or add custom domain)
3. Repeat for **Frontend service**

## Step 9: Run Migrations

In Railway dashboard, open the **API service** → **Shell**:
```bash
npm run db:migrate
```

## Environment Variables Reference

### API
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (from Railway) |
| `REDIS_URL` | Redis connection (from Railway) |
| `JWT_SECRET` | 32+ char secret for JWT |
| `CREDENTIALS_MASTER_KEY` | Base64 32-byte key |
| `API_PORT` | `3001` |
| `API_HOST` | `0.0.0.0` |
| `FRONTEND_URL` | Frontend domain URL |

### Worker
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis connection |
| `CREDENTIALS_MASTER_KEY` | Same as API |
| `WORKER_CONCURRENCY` | `5` |

### Frontend
| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | API domain URL |

## Generate Secrets

```bash
# JWT Secret (run in terminal)
openssl rand -hex 32

# Credentials Master Key (base64 32 bytes)
openssl rand -base64 32
```

## Troubleshooting

### Build fails
- Check Railway build logs
- Ensure Dockerfile paths are correct
- Verify pnpm-lock.yaml is committed

### API can't connect to DB
- Check `DATABASE_URL` is using Railway's variable reference: `${{Postgres.DATABASE_URL}}`

### Worker not processing jobs
- Verify `REDIS_URL` is set correctly
- Check worker logs in Railway dashboard

### Frontend shows blank page
- Ensure `VITE_API_URL` points to the API service domain
- Check browser console for errors
