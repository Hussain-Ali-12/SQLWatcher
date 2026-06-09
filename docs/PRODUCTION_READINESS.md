# SQLWatcher — Production Readiness Checklist

## Required secrets
- `SQLWATCHER_DATABASE_URL`
- `TARGET_DATABASE_URL`
- `SQLWATCHER_PROXY_TOKEN`
- `DIRECT_DATABASE_URL`
- `SQLWATCHER_PROXY_DATABASE_URL`
- `SQLWATCHER_API_BASE`
- `SQLWATCHER_USERNAME`
- `SQLWATCHER_PASSWORD`
- `FRONTEND_ORIGINS`
- `CORS_ORIGINS`

Never commit real values. Rotate credentials after screenshots, logs, or shared ZIPs expose them.

## Backend env additions
```text
CONTROL_DB_POOL_MIN_SIZE=3
CONTROL_DB_POOL_MAX_SIZE=20
TARGET_DB_POOL_MIN_SIZE=3
TARGET_DB_POOL_MAX_SIZE=20
DB_POOL_MAX_INACTIVE_CONNECTION_LIFETIME=300
```

## Fly proxy production settings
- `PROXY_RECORD_SEMAPHORE=25`
- `PROXY_RECORD_RETRY_COUNT=3`
- `PROXY_RULE_SYNC_INTERVAL_SECONDS=60`
- `PROXY_RECORD_HTTP_TIMEOUT_SECONDS=8`
- `PROXY_HTTP_TIMEOUT_SECONDS=12`
- VM: `512mb`, `performance`, `1 cpu`

## Frontend freshness model
- No polling storms on operational pages.
- WebSocket `sync_required` events invalidate targeted query keys.
- Manual Refresh remains available on dashboards.

## Database migration
The new migration is:

```text
backend/app/core/migrations/0007_production_performance_indexes.sql
```

It must apply successfully after backend redeploy.

## Smoke test
1. Backend health: `/api/health/live`.
2. SecureShop API health: `/api/health`.
3. Fly proxy logs show listening on `15432`.
4. SecureShop proxy mode shows connected.
5. SQLWatcher WebSocket shows connected.
6. Small benchmark shows close to proxy-side record count in SQLWatcher.
