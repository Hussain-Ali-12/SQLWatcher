# SQLWatcher Architecture

## Production topology

SQLWatcher is deployed as a PostgreSQL wire-protocol security monitor with a separate analyst dashboard and a protected demo application.

```text
Browser
  ├─ SQLWatcher Dashboard (Vercel)
  │    └─ HTTPS/WSS → SQLWatcher Backend API (Render)
  │          └─ SQLWatcher Control DB (Neon PostgreSQL)
  │
  └─ SecureShop Frontend (Vercel)
       └─ HTTPS → SecureShop API (Render)
             ├─ Direct mode → SecureShop DB (Neon PostgreSQL)
             └─ Proxy mode  → SQLWatcher TCP Proxy (Fly.io :15432)
                               ├─ PostgreSQL wire forwarding → SecureShop DB (Neon)
                               └─ telemetry/rules API calls → SQLWatcher Backend API
```

## Components

### SQLWatcher TCP Proxy

The proxy is the data-plane component. It accepts PostgreSQL wire-protocol connections, inspects SQL statements, applies fast local detection rules, forwards safe traffic to the target Neon database, and records telemetry asynchronously to the SQLWatcher backend. Rule synchronisation is non-blocking and falls back to cached/default rules when the backend is slow.

### SQLWatcher Backend API

The backend is the control-plane component. It owns authentication, rules, query logs, alerts, audit trail, ML baseline profiles, anomaly scoring, dashboard statistics, WebSocket sync events, and database migrations. It exposes proxy endpoints for rule sync and telemetry recording.

### SQLWatcher Dashboard

The dashboard is a React/Vite SPA served through Vercel. It uses token-based API access and a post-connect WebSocket authentication handshake. The frontend avoids aggressive polling and relies on targeted WebSocket-driven cache invalidation.

### SecureShop Demo Application

SecureShop demonstrates the difference between direct database access and protected proxy access. The SecureShop API can run benchmark, analytics, and anomaly-demo workflows against both direct Neon and SQLWatcher-protected proxy modes.

### Databases

- `sqlwatcher`: control-plane database for users, sessions, rules, query logs, alerts, ML profiles, audit trail, and migrations.
- `secureshop`: protected target database for demo products, customers, orders, employees, salaries, and related data.

The SQLWatcher control schema is managed by the backend migration runner in `backend/app/core/migrations/`. The SecureShop target schema is managed separately through `database/secureshop_schema.sql` and SecureShop migration/seed utilities.

## Request flow

1. SecureShop sends a SQL query through direct mode or proxy mode.
2. In proxy mode, the SQLWatcher proxy inspects the SQL before forwarding it to Neon.
3. The proxy immediately allows, flags, or blocks based on fast local rules.
4. Telemetry is sent asynchronously to the backend so the data-plane does not wait on dashboard/database processing.
5. The backend stores query logs, creates alerts for meaningful events, updates audit/ML data, and rate-limits dashboard sync notifications.
6. The dashboard receives targeted WebSocket sync events and invalidates only affected query caches.

## Production deployment notes

- Keep real credentials out of git. Use Render/Fly/Vercel secrets and environment variables.
- `SQLWATCHER_PROXY_TOKEN` must match between Fly proxy and Render backend.
- `FRONTEND_ORIGINS` on the backend must be a JSON array of allowed Vercel origins.
- `CORS_ORIGINS` on SecureShop API must contain only the SecureShop frontend origin value.
- For Fly free/low-cost deployment, use a shared 1GB VM. Performance CPU may require 2GB RAM depending on the account/region.
