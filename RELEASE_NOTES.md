# SQLWatcher Final Release Notes

## Final Candidate

```text
Phase 10.3 Final Handoff Package
```

## Major Completed Features

- SQLWatcher PostgreSQL proxy
- SQLWatcher dashboard/control plane
- Rule-based SQL inspection
- Alert generation and analyst review
- Query logging
- Audit trail
- ML/anomaly baseline profiles
- SecureShop client application
- Direct Database vs SQLWatcher Protected routing
- Scenario categories
- Multi-persona baseline simulation
- Performance comparison
- Responsive UI
- Professional terminology
- Realtime WebSocket reconnect handling
- Final QA scripts
- Final demo and operator documentation

## Final QA

Run:

```powershell
python scripts/final_release_quality_gate.py
python scripts/final_component_qa.py
python scripts/final_demo_qa.py
python scripts/final_package_manifest.py
```

Expected:

```text
PASS
```

## Important URLs

```text
SQLWatcher Dashboard: http://localhost:5173
SecureShop:           http://localhost:5174
SQLWatcher API:       http://localhost:8000/api/health
SecureShop API:       http://localhost:9000/api/health
```

## Production cleanup release v3

This release is the cleaned production package following the updated audit. It removes non-shipping artefacts, updates production documentation, narrows noisy WebSocket invalidation, and uses a Fly.io VM configuration that deploys reliably on the current account/region.
