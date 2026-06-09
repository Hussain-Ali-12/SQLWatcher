# Local verification with separate Neon databases

This project uses one local `.env` file for development and two Neon/PostgreSQL databases:

- SQLWatcher control database: `sqlwatcher`
- SecureShop protected target database: `secureshop`

This mirrors the production architecture while still allowing local Docker verification before cloud deployment.

## Current database layout

| Purpose | Neon database | Role/user |
|---|---|---|
| SQLWatcher users, sessions, logs, alerts, rules, ML, audit, migrations | `sqlwatcher` | `sqlwatcher` |
| SecureShop schema/data and protected application data | `secureshop` | `secureshop` |
| SecureShop runtime and SQLWatcher target-query execution | `secureshop` | `secureshop` |

## Schema source of truth

The SQLWatcher control database schema is managed by the backend migration runner:

```text
backend/app/core/migrations/
```

Do not manually apply a root `database/schema.sql` for SQLWatcher. The old combined schema dump was removed to prevent drift from the migration source of truth.

The SecureShop target database schema is separate:

```text
database/secureshop_schema.sql
```

Do not apply the SQLWatcher migrations to the SecureShop database, and do not apply the SecureShop schema to the SQLWatcher database.

## Edit only this file locally

```text
.env
```

It contains local database URLs, frontend URLs, proxy settings, and demo profile values. Do not commit it.

## Fresh local verification

Start and verify the backend first:

```bash
docker compose down
docker compose build --no-cache backend
docker compose up backend
```

In another terminal:

```bash
curl http://localhost:8000/api/health/live
```

Expected:

```json
{"alive":true}
```

The backend migration runner creates/updates SQLWatcher control tables inside the `sqlwatcher` database.

Then initialise the SecureShop target database:

```bash
docker compose build client-app
docker compose run --rm client-app python migrate_cloud_db.py
```

That applies `database/secureshop_schema.sql` and SecureShop seed data to the `secureshop` database.

Then start the full local stack:

```bash
docker compose build --no-cache backend sqlwatcher-proxy secureshop-api secureshop-frontend frontend
docker compose up -d backend sqlwatcher-proxy secureshop-api secureshop-frontend frontend
```

## Important local notes

- Keep `.env` out of git.
- Rotate Neon credentials after sharing screenshots/logs.
- Use proxy mode when validating SQLWatcher telemetry.
- Direct mode intentionally bypasses SQLWatcher and should not appear in SQLWatcher logs.
