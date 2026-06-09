# SQLWatcher — Final Production Audit Report

## Status
Production readiness pass completed after full-stack deployment testing on Render, Fly.io, Vercel, and Neon.

## Implemented hardening

### Backend control plane
- Database pool sizing is now configurable and production-oriented.
- Default control and target pools are `min_size=3`, `max_size=20` with `max_inactive_connection_lifetime=300`.
- Proxy record ingestion returns quickly and writes telemetry asynchronously.
- Lightweight proxy ingestion now covers low-risk `ALLOW` and low-risk `FLAG` events.
- Full anomaly/audit/notification pipeline is reserved for `BLOCK`, `HIGH`, `CRITICAL`, and high-risk rows.
- Timing ownership is centralized at call sites to avoid duplicate/racing timing updates.
- `/api/proxy/rules` keeps cache/fallback behavior so the proxy data plane is not blocked by slow rule reads.
- Removed the extra `get_by_id()` round trip after full proxy pipeline insertion.

### Database and query performance
- Added migration `0007_production_performance_indexes.sql`.
- Added composite indexes for action/severity timestamp filters and lateral anomaly joins.
- Dashboard/performance aggregate queries are constrained to recent production windows to avoid unbounded table scans.

### Proxy data plane
- Fly proxy now uses a bounded worker queue for telemetry instead of creating one task per query.
- Proxy rule sync remains non-blocking.
- Proxy record concurrency is restored to 25 workers.
- Retry count increased to 3.
- Fly VM sizing moved to `512mb` and `performance` CPU for production stability.
- Important security decisions are preserved even when the telemetry queue is full.

### Frontend load reduction
- Removed aggressive polling from Overview, Logs, Performance, ML, and Threat Map pages.
- Kept Settings polling only, at 60 seconds.
- Disabled window-focus refetch storms globally.
- Dashboard freshness is driven by WebSocket invalidation plus manual refresh.
- ML WebSocket invalidation now targets actual query keys: `profiles`, `anomalies`, and `evaluation`.

### Production deployment hygiene
- Vercel SPA rewrites are preserved for both frontends.
- Public npm registry lockfiles are preserved.
- `.env`/real credential files are excluded.
- Demo credentials remain removed from the production login page.

## Deployment order
1. Rotate Neon role passwords and regenerate `SQLWATCHER_PROXY_TOKEN`.
2. Push this final project to GitHub.
3. Deploy SQLWatcher backend on Render.
4. Deploy SecureShop API on Render.
5. Deploy SQLWatcher proxy on Fly.io.
6. Deploy/redeploy both Vercel frontends.
7. Update CORS origins in Render.
8. Run small benchmark validation before full benchmark.

## Recommended validation benchmark
Run this first:

```text
Requests per path: 100
Concurrency: 10
Repeats: 2
Mode: Direct + Proxy
```

Expected:

```text
SecureShop attempts: 400
SQLWatcher records: approximately 200 proxy-side records after 20–40 seconds
```

Then run the full benchmark:

```text
Requests per path: 1000
Concurrency: 25
Repeats: 5
Mode: Direct + Proxy
```

Expected:

```text
SecureShop attempts: 10,000
SQLWatcher records: approximately 5,000 proxy-side records after background ingestion catches up
```

SQLWatcher should not show the direct Neon half because that path intentionally bypasses the proxy.

## Important production note
`cpu_kind = "performance"` and larger pool defaults are production settings. For a strict free-tier demo, reduce:

```text
CONTROL_DB_POOL_MAX_SIZE=10
TARGET_DB_POOL_MAX_SIZE=10
```

and use Fly shared CPU if cost is more important than latency.
