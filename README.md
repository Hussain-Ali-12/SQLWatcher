# SQLWatcher

SQLWatcher is a production-oriented PostgreSQL wire-protocol security monitoring system. It places a lightweight TCP proxy between an application and PostgreSQL, inspects SQL activity, forwards allowed traffic, and records security telemetry to a FastAPI control plane and React analyst dashboard.

## Current production architecture

```text
SQLWatcher Dashboard (Vercel)
  → SQLWatcher Backend API (Render)
  → SQLWatcher Control DB (Neon)

SecureShop Frontend (Vercel)
  → SecureShop API (Render)
  → Direct Neon path or SQLWatcher TCP Proxy (Fly.io)
  → SecureShop DB (Neon)
```

See [`docs/architecture.md`](docs/architecture.md) for the full topology.

## Services

| Service | Path | Runtime | Purpose |
|---|---|---|---|
| SQLWatcher backend | `backend/` | FastAPI + asyncpg | Auth, rules, logs, alerts, ML/anomaly baseline, migrations, WebSocket sync |
| SQLWatcher dashboard | `frontend/` | React/Vite | Analyst dashboard |
| SQLWatcher TCP proxy | `proxy/` | Python asyncio | PostgreSQL wire-protocol inspection and forwarding |
| SecureShop API | `secureshop/backend/` | FastAPI | Demo app API and benchmark/anomaly workflows |
| SecureShop frontend | `secureshop/frontend/` | React/Vite | Demo storefront/client workload generator |
| Shared detection | `shared/` | Python package | SQL parsing/detection helpers shared by backend and proxy |

## Production deployment targets

| Component | Platform |
|---|---|
| SQLWatcher frontend | Vercel |
| SecureShop frontend | Vercel |
| SQLWatcher backend API | Render |
| SecureShop API | Render |
| SQLWatcher TCP proxy | Fly.io |
| SQLWatcher and SecureShop databases | Neon PostgreSQL |

## Required secrets and environment variables

Never commit real credentials. Use `.env.example` only as a template.

### SQLWatcher backend

```text
SQLWATCHER_DATABASE_URL=postgresql://sqlwatcher:...@.../sqlwatcher?sslmode=require
TARGET_DATABASE_URL=postgresql://secureshop:...@.../secureshop?sslmode=require
SQLWATCHER_PROXY_TOKEN=<same strong token used by Fly proxy>
FRONTEND_ORIGINS=["https://sql-watcher.vercel.app","https://secureshop-eosin.vercel.app"]
ENVIRONMENT=production
LOG_FORMAT=json
```

### Fly proxy

Set secrets with `fly secrets set`, not in `proxy/fly.toml`:

```text
PROXY_TARGET_HOST=<neon-host-only>
SQLWATCHER_BACKEND_URL=https://sqlwatcher-backend.onrender.com
SQLWATCHER_PROXY_TOKEN=<same token as backend>
```

### SecureShop API

```text
DIRECT_DATABASE_URL=postgresql://secureshop:...@.../secureshop?sslmode=require
SQLWATCHER_PROXY_DATABASE_URL=postgresql://secureshop:...@sqlwatcher-proxy.fly.dev:15432/secureshop?sslmode=disable
SQLWATCHER_API_BASE=https://sqlwatcher-backend.onrender.com/api
SQLWATCHER_USERNAME=admin
SQLWATCHER_PASSWORD=<dashboard password>
CORS_ORIGINS=https://secureshop-eosin.vercel.app
DEFAULT_CONNECTION_MODE=proxy
```

### Frontends

```text
# SQLWatcher frontend
VITE_API_BASE=https://sqlwatcher-backend.onrender.com/api
VITE_WS_BASE=wss://sqlwatcher-backend.onrender.com

# SecureShop frontend
VITE_API_BASE_URL=https://secureshop-api.onrender.com
VITE_SQLWATCHER_UI_BASE=https://sql-watcher.vercel.app
```

## Local verification

See [`README_LOCAL_ENV.md`](README_LOCAL_ENV.md) for local Docker and Neon verification.

## Deployment order

1. Rotate Neon passwords and generate a fresh `SQLWATCHER_PROXY_TOKEN`.
2. Deploy SQLWatcher backend on Render.
3. Deploy SQLWatcher proxy on Fly.io.
4. Deploy SecureShop API on Render.
5. Deploy SQLWatcher frontend on Vercel.
6. Deploy SecureShop frontend on Vercel.
7. Update backend `FRONTEND_ORIGINS` and SecureShop API `CORS_ORIGINS` with final Vercel URLs.
8. Smoke test direct mode, proxy mode, logs, alerts, benchmark, and WebSocket status.

## Benchmark interpretation

SecureShop benchmarks usually run both direct and proxy paths. SQLWatcher only sees the proxy path. For example:

```text
Requests per path: 1000
Repeats: 5
Direct attempts: 5000
Proxy attempts: 5000
Total SecureShop attempts: 10000
Expected SQLWatcher records: about 5000 proxy-side records after telemetry flush
```

Direct Neon traffic intentionally bypasses SQLWatcher and will not appear in SQLWatcher logs.

## Production readiness documents

- [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md)
- [`docs/PRODUCTION_AUDIT_REPORT.md`](docs/PRODUCTION_AUDIT_REPORT.md)
- [`docs/cloud-demo-runbook.md`](docs/cloud-demo-runbook.md)
- [`docs/deployment-configuration-guide.md`](docs/deployment-configuration-guide.md)

## Security notes

- Rotate credentials after screenshots/logs that reveal URLs or passwords.
- Keep `.env`, `prod.env`, and platform secrets out of git.
- Use strong random `SQLWATCHER_PROXY_TOKEN` values.
- Keep `FRONTEND_ORIGINS` as a JSON array.
- Keep SecureShop `CORS_ORIGINS` as the origin value only, not `CORS_ORIGINS=...` inside the value field.
