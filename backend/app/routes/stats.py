from __future__ import annotations

from dataclasses import asdict
from time import perf_counter

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.database import get_control_db, get_target_db
from app.dependencies.auth import get_current_user
from app.dependencies.db import Repos, get_repos
from app.services.websocket_manager import manager

router = APIRouter(prefix="/api", tags=["Stats and Health"])


def _record_dict(record) -> dict:
    return asdict(record)


@router.get("/health/live")
async def live():
    return {"alive": True}


async def _db_check(conn) -> dict:
    started = perf_counter()
    try:
        await conn.fetchrow("SELECT 1")
        return {"ok": True, "latency_ms": round((perf_counter() - started) * 1000, 3)}
    except Exception as exc:
        return {"ok": False, "latency_ms": round((perf_counter() - started) * 1000, 3), "error": str(exc)}


@router.get("/health")
async def health(control_conn=Depends(get_control_db), target_conn=Depends(get_target_db)):
    control = await _db_check(control_conn)
    target = await _db_check(target_conn)
    checks = {
        "control_db": control,
        "target_db": target,
        "proxy_token_configured": {"ok": bool(settings.sqlwatcher_proxy_token)},
        "pending_migrations": {"ok": True, "count": 0},
        "ws_connections": {"ok": True, "count": manager.connection_count()},
    }
    return {"status": "healthy" if all(item.get("ok") for item in checks.values()) else "degraded", "checks": checks}


@router.get("/stats")
async def dashboard_stats(current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return _record_dict(await repos.stats.get_dashboard_stats())


@router.get("/timeline")
async def timeline(hours: int = 24, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    rows = await repos.stats.get_timeline(max(1, min(int(hours), 168)))
    return [_record_dict(row) for row in rows]


@router.get("/performance/summary")
async def performance_summary(current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    record = await repos.stats.get_performance_summary()
    if record is None:
        return {
            "total_samples": 0,
            "total_queries": 0,
            "timed_samples": 0,
            "avg_total_ms": 0,
            "avg_detection_ms": 0,
            "avg_anomaly_ms": 0,
            "avg_execution_ms": 0,
            "min_total_ms": 0,
            "max_total_ms": 0,
            "p50_total_ms": 0,
            "p95_total_ms": 0,
            "p99_total_ms": 0,
            "allow_count": 0,
            "flag_count": 0,
            "block_count": 0,
            "error_count": 0,
        }
    return _record_dict(record)


@router.get("/performance/timeseries")
async def performance_timeseries(hours: int = 24, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return await repos.stats.get_performance_timeseries(max(1, min(int(hours), 168)))


@router.get("/stats/top-attackers")
async def top_attackers(limit: int = 5, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return await repos.stats.get_top_attackers(max(1, min(int(limit), 100)))
