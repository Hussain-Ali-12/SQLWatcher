from __future__ import annotations

import os
import time
from typing import Any

from app.core.database import get_control_pool
from app.repos.config_repo import ConfigRepo

ANOMALY_CONFIG_KEYS = {
    "anomaly_detection_enabled",
    "anomaly_enforcement_mode",
    "anomaly_min_score",
}

CACHE_SECONDS = float(os.getenv("ANOMALY_POLICY_CACHE_SECONDS", "5"))
_POLICY_CACHE: dict[str, Any] = {"expires_at": 0.0, "policy": None}


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on", "enabled"}


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None or value == "":
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on", "enabled"}


def _parse_int(value: str | None, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(str(value))
    except Exception:
        parsed = default
    return max(minimum, min(maximum, parsed))


def _normalize_mode(value: str | None) -> str:
    mode = (value or "flag").strip().lower()
    if mode in {"monitor", "observe"}:
        return "observe"
    if mode in {"flag", "block"}:
        return mode
    return "flag"


async def get_anomaly_policy(force_refresh: bool = False) -> dict[str, Any]:
    """Return cached anomaly runtime policy.

    This intentionally uses a short cache so the dashboard can disable anomaly
    scoring without requiring a restart while avoiding a control-DB lookup for
    every proxy-recorded query.
    """
    now = time.time()
    if not force_refresh and _POLICY_CACHE["policy"] and now < float(_POLICY_CACHE["expires_at"]):
        return dict(_POLICY_CACHE["policy"])

    defaults = {
        "enabled": _env_bool("ANOMALY_DETECTION_ENABLED", True),
        "enforcement_mode": _normalize_mode(os.getenv("ANOMALY_ENFORCEMENT_MODE", "flag")),
        "min_score": _parse_int(os.getenv("ANOMALY_MIN_SCORE"), 70, 1, 100),
        "source": "environment/default",
        "cache_seconds": CACHE_SECONDS,
    }

    try:
        pool = get_control_pool()
        async with pool.acquire() as conn:
            all_values = await ConfigRepo(conn).get_all()
        values = {key: item.get("value") for key, item in all_values.items() if key in ANOMALY_CONFIG_KEYS}

        enabled = _parse_bool(values.get("anomaly_detection_enabled"), defaults["enabled"])
        mode = _normalize_mode(values.get("anomaly_enforcement_mode") or defaults["enforcement_mode"])
        min_score = _parse_int(values.get("anomaly_min_score"), defaults["min_score"], 1, 100)

        policy = {
            "enabled": enabled,
            "enforcement_mode": mode,
            "min_score": min_score,
            "source": "dashboard" if values else defaults["source"],
            "cache_seconds": CACHE_SECONDS,
            "latency_note": (
                "Anomaly detection is disabled. SQLWatcher runs rule detection only."
                if not enabled
                else (
                    "Anomaly scoring runs after rule detection. In block mode, SQLWatcher promotes anomalous recorded decisions to BLOCK and raises alerts."
                    if mode == "block"
                    else "Anomaly detection runs after rule detection and may add extra processing overhead."
                )
            ),
        }
    except Exception as exc:
        policy = {
            **defaults,
            "source": "environment/default",
            "warning": f"Failed to read dashboard anomaly policy: {exc}",
        }

    _POLICY_CACHE["policy"] = policy
    _POLICY_CACHE["expires_at"] = now + CACHE_SECONDS
    return dict(policy)


async def save_anomaly_policy(enabled: bool, enforcement_mode: str, min_score: int) -> dict[str, Any]:
    mode = _normalize_mode(enforcement_mode)
    score = max(1, min(100, int(min_score)))

    values = {
        "anomaly_detection_enabled": "true" if enabled else "false",
        "anomaly_enforcement_mode": mode,
        "anomaly_min_score": str(score),
    }

    pool = get_control_pool()
    async with pool.acquire() as conn:
        repo = ConfigRepo(conn)
        for key, value in values.items():
            await repo.upsert(key, value, False)

    _POLICY_CACHE["expires_at"] = 0.0
    return await get_anomaly_policy(force_refresh=True)
