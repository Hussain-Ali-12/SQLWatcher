# Deployment Configuration Guide

## Real-World Client Integration

A production client application should normally use one database URL:

```text
DATABASE_URL=postgresql://appuser:<password>@sqlwatcher-proxy-host:15432/appdb?sslmode=disable
```

SQLWatcher Proxy then forwards safe traffic to the protected PostgreSQL database.

## Protected Database Target

The SQLWatcher proxy target is configured through deployment environment variables:

```text
PROXY_TARGET_HOST=<neon-host>
PROXY_TARGET_PORT=5432
PROXY_TARGET_SSL_MODE=require
```

For Neon, the direct protected database URL usually includes:

```text
sslmode=require
```

## SQLWatcher Control Database

The SQLWatcher control database is separate from the protected business database.

```text
SQLWATCHER_DATABASE_URL=postgresql://sqlwatcher:<password>@<control-db-host>:5432/sqlwatcher?sslmode=require
```

This should be managed through deployment secrets and not changed inside the dashboard.

## Dashboard Settings

The dashboard can now help with:

```text
Copy Proxy URL
Copy Production DATABASE_URL
Copy Proxy ENV Snippet
Test Protected DB URL
Save Deployment Draft
```

## Applying Changes

Dashboard deployment drafts are documentation/configuration assistance.

Real changes still require updating deployment secrets and restarting/redeploying the proxy/backend services.
