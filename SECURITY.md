# SQLWatcher Security Policy

## Scope

SQLWatcher is a production-oriented final-year cybersecurity prototype that demonstrates a PostgreSQL database firewall/proxy architecture.

The current supported scope is:

- PostgreSQL target database
- PostgreSQL Simple Query protocol enforcement
- MVP Extended Query protocol enforcement
- SQLWatcher control-plane database separation
- Real client application testing through proxy mode

## Security Design Principles

- Keep SQLWatcher control data separate from protected application data.
- Block high-confidence dangerous queries before they reach the target database.
- Record security events in the SQLWatcher control-plane database.
- Keep critical alerting immediate.
- Use proxy-local detection for low-latency enforcement.
- Use background recording for logs and dashboard visibility.

## Current Known Limitations

- TLS termination is not implemented in the proxy yet.
- Bind parameter reconstruction is not fully implemented.
- The proxy does not yet implement production-grade connection pooling.
- SQLWatcher currently targets PostgreSQL only.
- Proxy authentication uses the target PostgreSQL authentication flow.
- Proxy-to-backend authentication currently uses a static proxy token.
- Secrets in `.env` are live runtime values and must not be committed or shared publicly.

## Production Security Requirements Before Real Deployment

- Replace all demo credentials.
- Use strong unique passwords and secrets.
- Use TLS for client-to-proxy and proxy-to-database traffic.
- Move secrets into Docker/Kubernetes secrets or a vault.
- Add strict network segmentation.
- Add rate limiting and abuse protection.
- Add structured immutable audit logging.
- Run dependency, SAST, and container vulnerability scans.
- Add backup and retention policies for SQLWatcher control-plane data.
- Add fail-open/fail-closed policy testing.
