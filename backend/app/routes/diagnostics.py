from __future__ import annotations

import os
import socket
from time import perf_counter

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies.auth import get_current_user, require_roles
from app.dependencies.db import get_control_db
from app.routes.settings import mask_url

router = APIRouter(prefix="/api/system", tags=["Diagnostics"])


class DatabaseUrlTestPayload(BaseModel):
    database_url: str = Field(..., min_length=8)


def tcp_check(host: str, port: int, timeout: float = 1.5) -> dict:
    started = perf_counter()
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return {"ok": True, "host": host, "port": port, "latency_ms": round((perf_counter() - started) * 1000, 3)}
    except Exception as exc:
        return {"ok": False, "host": host, "port": port, "latency_ms": round((perf_counter() - started) * 1000, 3), "error": str(exc)}


@router.post("/test-database-url")
async def test_database_url(payload: DatabaseUrlTestPayload, current_user: dict = Depends(require_roles("admin", "analyst"))):
    started = perf_counter()
    masked = mask_url(payload.database_url)
    try:
        conn = await asyncpg.connect(payload.database_url, timeout=8, command_timeout=8)
        row = await conn.fetchrow("SELECT current_database() AS database, current_user AS db_user")
        await conn.close()
        return {"ok": True, "latency_ms": round((perf_counter() - started) * 1000, 3), "masked_url": masked, "database": dict(row) if row else {}}
    except Exception as exc:
        return {"ok": False, "latency_ms": round((perf_counter() - started) * 1000, 3), "masked_url": masked, "error": str(exc)}


@router.post("/connection-test")
async def connection_test(current_user: dict = Depends(get_current_user), conn=Depends(get_control_db)):
    started = perf_counter()
    control = await conn.fetchrow("SELECT current_database() AS database, current_user AS db_user")
    target_host = os.getenv("PROXY_TARGET_HOST", os.getenv("CLOUD_DB_HOST", "target-db"))
    target_port = int(os.getenv("PROXY_TARGET_PORT", os.getenv("CLOUD_DB_PORT", "5432")))
    proxy_host = os.getenv("PROXY_LISTEN_HOST", "sqlwatcher-proxy")
    proxy_port = int(os.getenv("PROXY_LISTEN_PORT", "15432"))
    return {
        "ok": True,
        "latency_ms": round((perf_counter() - started) * 1000, 3),
        "control_database": dict(control) if control else {},
        "control_db_policy": "Read-only from dashboard. Managed through deployment secrets.",
        "proxy_listener": tcp_check(proxy_host if proxy_host != "0.0.0.0" else "sqlwatcher-proxy", proxy_port),
        "protected_database_socket": tcp_check(target_host, target_port),
        "restart_required_for_target_change": True,
    }
