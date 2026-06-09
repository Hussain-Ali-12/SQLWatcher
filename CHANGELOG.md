# SQLWatcher Changelog

## v0.9.1 - SecureShop Client Deployment Simulation

- Added SecureShop client API backend
- Added SecureShop React frontend
- Added Direct DB / SQLWatcher Proxy mode switch
- Added security test scenarios
- Added direct-vs-proxy benchmark UI
- Added Docker Compose services and hosting plan


## v0.8.0 - Production Hardening and Final Documentation

- Added final project summary
- Added final architecture document
- Added final benchmark report
- Added final defense Q&A
- Added production hardening checklist
- Added final runbook
- Added screenshot checklist
- Added `SECURITY.md`
- Added `.env`
- Updated dashboard version label to production proxy identity

## v0.7.4.1 - Extended Execute Logging Fix

- Fixed prepared statement benchmark log undercounting
- Changed Extended Query logging from Parse-time to Execute-time
- Added wait helper for proxy logs

## v0.7.4 - Proxy Fast Inspection Path

- Added proxy-local fast detection
- Added background proxy decision recording
- Added `/api/proxy/record`
- Improved proxy benchmark performance

## v0.7.3 - Real Driver Client and Proxy Benchmark

- Added Python psycopg client application
- Added direct-vs-proxy benchmark
- Added extended protocol demo

## v0.7.2 - Extended Query Protocol Support

- Added Parse/Bind/Execute state tracking
- Added prepared statement enforcement

## v0.7.1 - PostgreSQL Wire Proxy MVP

- Added real PostgreSQL proxy service
- Added separate client app
- Added proxy inspection API

## v0.6.x - Production Foundation

- Added database separation
- Added performance instrumentation
- Added real-time sync batching
- Added benchmark scripts

## v0.5.x - Productized Dashboard

- Added login
- Added RBAC
- Added notifications
- Added audit trail
- Added ML baseline page
- Added brand UI polish

## Production cleanup pass v3

- Removed committed Python bytecode, dead service wrappers, redundant ML requirements file, stale SecureShop static fallback, unused page stubs, and internal audit artefacts.
- Moved production readiness/audit reports into `docs/`.
- Removed drift-prone `database/schema.sql`; backend migrations are now documented as the SQLWatcher schema source of truth.
- Rewrote architecture and local environment docs for the current Vercel/Render/Fly/Neon deployment.
- Scoped `new_alert` frontend invalidation to alerts/stats only.
- Updated Fly proxy VM to `1gb` shared CPU for deployment compatibility.
