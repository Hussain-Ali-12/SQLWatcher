# SQLWatcher Cloud Demo Runbook

## 1. Create Cloud PostgreSQL

Create a demo PostgreSQL database on Neon, Supabase, Render, or another provider. Use demo data only.

## 2. Initialize Schema

```bash
docker compose build client-app
docker compose run --rm -e CLOUD_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" client-app python migrate_cloud_db.py
```

## 3. Configure Cloud Demo

```bash
```

Edit:

```text
CLOUD_DIRECT_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
CLOUD_PROXY_DATABASE_URL=postgresql://USER:PASSWORD@sqlwatcher-proxy:15432/DBNAME?sslmode=disable
CLOUD_DB_HOST=HOST
CLOUD_DB_PORT=5432
PROXY_TARGET_SSL_MODE=require
```

## 4. Run

```bash
docker compose --env-file .env.cloud-demo -f docker-compose.yml -f docker-compose.cloud-demo.yml up --build
```

Open:

```text
SecureShop: http://localhost:5174
SQLWatcher: http://localhost:5173
```
