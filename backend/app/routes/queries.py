from __future__ import annotations

import asyncio
from dataclasses import asdict
from time import perf_counter, time as epoch_seconds
from types import SimpleNamespace
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import get_control_pool
from app.core.logging import get_logger
from app.dependencies.auth import require_roles
from app.dependencies.db import Repos, get_repos
from app.models.schemas import DetectionResult, QueryRequest, QueryResponse
from app.repos.alert_repo import AlertRepo
from app.repos.anomaly_repo import AnomalyRepo
from app.repos.audit_repo import AuditRepo
from app.repos.baseline_repo import BaselineRepo
from app.repos.feature_repo import FeatureRepo
from app.repos.feedback_repo import FeedbackRepo
from app.repos.notification_repo import NotificationRepo
from app.repos.query_log_repo import QueryLogRepo
from app.repos.rule_repo import RuleRepo
from app.services.anomaly_service import AnomalyService
from app.services.audit_service import AuditService
from app.services.detection_service import DetectionService
from app.services.notification_service import NotificationService
from app.services.query_executor import execute_safe_query as run_safe_query
from app.services.query_pipeline_service import QueryContext, QueryPipeline
from app.services.realtime_sync import RealtimeSync, sync_service
from app.services.rule_service import RuleService
from app.services.websocket_manager import WebSocketManager, manager
from shared.detection.engine import DEFAULT_RULES
from shared.sql.features import extract_query_features

router = APIRouter(prefix="/api", tags=["Query Gateway and Proxy"])

logger = get_logger(__name__)

_PROXY_RULE_CACHE_TTL_SECONDS = 60.0
_PROXY_RULE_CACHE: dict[str, Any] = {
    "expires_at": 0.0,
    "enabled_rule_names": sorted(DEFAULT_RULES),
    "custom_rules": [],
    "source": "default",
}

PROTOCOL_MODE_LABELS = {
    "postgres_simple_query": "Simple Query message",
    "postgres_extended_parse": "Extended Query Parse",
    "postgres_extended_execute": "Extended Query Execute",
    "simple_query": "Simple Query",
    "proxy_fast_local": "Proxy Fast-Path Local Decision",
}


def elapsed_ms(start: float) -> float:
    return round((perf_counter() - start) * 1000, 3)


async def _apply_timings(repo: QueryLogRepo, query_id: int, timings: dict[str, float]) -> None:
    if not timings:
        return
    await repo.update_timings(
        query_id,
        float(timings.get("detection_ms", 0.0)),
        float(timings.get("anomaly_ms", 0.0)),
        float(timings.get("execution_ms", 0.0)),
        float(timings.get("total_ms", 0.0)),
    )


def format_proxy_capture_note(protocol_mode: str) -> str:
    label = PROTOCOL_MODE_LABELS.get(protocol_mode, protocol_mode.replace("_", " ").title())
    return f"Source: PostgreSQL wire proxy • Protocol event: {label}"


class ProxyInspectRequest(BaseModel):
    sql: str = Field(..., min_length=1)
    db_user: str = "proxy_user"
    client_ip: str = "unknown"
    protocol_mode: str = "simple_query"


class ProxyRecordRequest(BaseModel):
    sql: str = Field(..., min_length=1)
    db_user: str = "proxy_user"
    client_ip: str = "unknown"
    protocol_mode: str = "proxy_fast_local"
    action: str = "ALLOW"
    severity: str = "NONE"
    risk_score: int = 0
    detection_method: str = "NONE"
    explanation: str = "Proxy fast-path local decision."
    detection_ms: float = 0.0


async def require_proxy_token(x_sqlwatcher_proxy_token: str | None = Header(default=None)) -> None:
    if x_sqlwatcher_proxy_token != settings.sqlwatcher_proxy_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid SQLWatcher proxy token.")


async def _run_pipeline_detached(context: QueryContext) -> None:
    try:
        pool = get_control_pool()
        async with pool.acquire() as conn:
            rule_repo = RuleRepo(conn)
            pipeline = QueryPipeline(
                QueryLogRepo(conn),
                FeatureRepo(conn),
                AnomalyService(AnomalyRepo(conn), BaselineRepo(conn), FeedbackRepo(conn)),
                AlertRepo(conn),
                NotificationService(NotificationRepo(conn)),
                AuditService(AuditRepo(conn)),
                RuleService(rule_repo),
                manager,
                sync_service,
            )
            query_id = await pipeline.run(context)
            await _apply_timings(pipeline.query_log_repo, query_id, context.timings)
    except Exception as exc:
        logger.error(
            "detached_query_pipeline_failed",
            db_user=context.db_user,
            sql=context.sql[:200],
            error=str(exc),
        )


def _query_response(result: DetectionResult, data: list[dict[str, Any]] | None, query_id: int | None, features: dict[str, Any] | None) -> QueryResponse:
    return QueryResponse(
        action=result.action,
        severity=result.severity,
        risk_score=result.risk_score,
        explanation=result.explanation,
        data=data,
        query_id=query_id,
        normalized_sql=result.normalized_sql,
        features=features,
    )


@router.post("/query", response_model=QueryResponse)
async def submit_query(
    payload: QueryRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_roles("admin", "analyst")),
    repos: Repos = Depends(get_repos),
):
    request_started = perf_counter()
    detection_started = perf_counter()
    result = await DetectionService(repos.rule).inspect(payload.sql, payload.db_user, payload.client_ip)
    detection_ms = elapsed_ms(detection_started)
    features = extract_query_features(payload.sql, payload.db_user)

    if result.action == "BLOCK":
        total_ms = elapsed_ms(request_started)
        background_tasks.add_task(
            _run_pipeline_detached,
            QueryContext(
                sql=payload.sql,
                db_user=payload.db_user,
                client_ip=payload.client_ip,
                result=result,
                actor=dict(current_user),
                features=features,
                timings={"detection_ms": detection_ms, "execution_ms": 0.0, "total_ms": total_ms},
            ),
        )
        return _query_response(result, None, None, features)

    execution_started = perf_counter()
    try:
        data = await run_safe_query(payload.sql)
        execution_ms = elapsed_ms(execution_started)
        total_ms = elapsed_ms(request_started)
        background_tasks.add_task(
            _run_pipeline_detached,
            QueryContext(
                sql=payload.sql,
                db_user=payload.db_user,
                client_ip=payload.client_ip,
                result=result,
                actor=dict(current_user),
                features=features,
                timings={"detection_ms": detection_ms, "execution_ms": execution_ms, "total_ms": total_ms},
            ),
        )
        return _query_response(result, data, None, features)
    except Exception as exc:
        execution_ms = elapsed_ms(execution_started)
        total_ms = elapsed_ms(request_started)
        error_result = DetectionResult(
            action="ERROR",
            severity=result.severity if result.severity != "NONE" else "LOW",
            risk_score=result.risk_score,
            detection_method=result.detection_method,
            explanation=f"{result.explanation} Database execution failed: {exc}",
            query_type=result.query_type,
            normalized_sql=result.normalized_sql,
        )
        background_tasks.add_task(
            _run_pipeline_detached,
            QueryContext(
                sql=payload.sql,
                db_user=payload.db_user,
                client_ip=payload.client_ip,
                result=error_result,
                actor=dict(current_user),
                features=features,
                timings={"detection_ms": detection_ms, "execution_ms": execution_ms, "total_ms": total_ms},
                execution_error=str(exc),
            ),
        )
        return _query_response(error_result, None, None, features)


@router.get("/proxy/rules", dependencies=[Depends(require_proxy_token)])
async def proxy_rules() -> dict[str, Any]:
    """Return proxy rule config quickly, with cached/default fallback.

    This endpoint sits on the proxy data-plane hot path. It must not hang when
    the free Render control-plane is cold or busy with resets/baseline training.
    Avoid the shared Repos dependency here because dependency-level pool waits
    cannot be caught inside the handler.
    """
    now = epoch_seconds()
    if now < float(_PROXY_RULE_CACHE.get("expires_at", 0)):
        return dict(_PROXY_RULE_CACHE)

    try:
        pool = get_control_pool()
        async with asyncio.timeout(3.0):
            async with pool.acquire() as conn:
                enabled = await RuleRepo(conn).get_enabled()
        result = {
            "enabled_rule_names": [row.rule_name for row in enabled],
            "custom_rules": [
                asdict(row)
                for row in enabled
                if not row.is_system and row.match_pattern
            ],
            "source": "database",
            "expires_at": now + _PROXY_RULE_CACHE_TTL_SECONDS,
        }
        _PROXY_RULE_CACHE.update(result)
        return result
    except Exception as exc:
        logger.warning("proxy_rules_cache_fallback", error=str(exc))
        _PROXY_RULE_CACHE["expires_at"] = now + 30.0
        _PROXY_RULE_CACHE["source"] = "fallback"
        return dict(_PROXY_RULE_CACHE)


async def _record_proxy_decision(payload: ProxyRecordRequest, repos: Repos, detection_ms: float | None = None) -> dict[str, Any]:
    explanation = f"{payload.explanation} [{format_proxy_capture_note(payload.protocol_mode)}]"
    result = DetectionResult(
        action=payload.action,
        severity=payload.severity,
        risk_score=payload.risk_score,
        detection_method=payload.detection_method,
        explanation=explanation,
        query_type="PROXY",
        normalized_sql=payload.sql,
    )
    features = extract_query_features(payload.sql, payload.db_user)
    pipeline = QueryPipeline(
        repos.query_log,
        repos.feature,
        AnomalyService(repos.anomaly, repos.baseline, repos.feedback),
        repos.alert,
        NotificationService(repos.notification),
        AuditService(repos.audit),
        RuleService(repos.rule),
        manager,
        sync_service,
    )
    timings = {
        "detection_ms": detection_ms if detection_ms is not None else payload.detection_ms,
        "execution_ms": 0.0,
        "total_ms": detection_ms if detection_ms is not None else payload.detection_ms,
    }
    query_id = await pipeline.run(
        QueryContext(
            sql=payload.sql,
            db_user=payload.db_user,
            client_ip=payload.client_ip,
            result=result,
            actor=None,
            features=features,
            timings=timings,
        )
    )
    await _apply_timings(repos.query_log, query_id, timings)
    return {
        "query_id": query_id,
        "action": result.action,
        "severity": result.severity,
        "risk_score": result.risk_score,
        "detection_method": result.detection_method,
        "explanation": result.explanation,
        "detection_ms": detection_ms if detection_ms is not None else payload.detection_ms,
    }


@router.post("/proxy/inspect", dependencies=[Depends(require_proxy_token)])
async def inspect_proxy_query(payload: ProxyInspectRequest, repos: Repos = Depends(get_repos)) -> dict[str, Any]:
    started = perf_counter()
    result = await DetectionService(repos.rule).inspect(payload.sql, payload.db_user, payload.client_ip)
    detection_ms = elapsed_ms(started)
    record = ProxyRecordRequest(
        sql=payload.sql,
        db_user=payload.db_user,
        client_ip=payload.client_ip,
        protocol_mode=payload.protocol_mode,
        action=result.action,
        severity=result.severity,
        risk_score=result.risk_score,
        detection_method=result.detection_method,
        explanation=result.explanation,
        detection_ms=detection_ms,
    )
    return await _record_proxy_decision(record, repos, detection_ms)


def _use_lightweight_proxy_record(payload: ProxyRecordRequest) -> bool:
    """Use a low-cost insert path for high-volume proxy telemetry.

    The full anomaly/audit/alert pipeline is reserved for decisions that can
    change analyst state: BLOCK, HIGH/CRITICAL severity, and high-risk rows.
    Low-risk ALLOW/FLAG records are still inserted for benchmark/count accuracy,
    but they do not consume expensive anomaly, audit, notification, or websocket
    resources.
    """
    action = payload.action.upper()
    severity = payload.severity.upper()
    risk_score = int(payload.risk_score or 0)
    return action in {"ALLOW", "FLAG"} and severity not in {"HIGH", "CRITICAL"} and risk_score <= 25


def _should_sync_lightweight_record(payload: ProxyRecordRequest) -> bool:
    """Only websocket-sync lightweight rows that are analyst-relevant."""
    return payload.action.upper() != "ALLOW" or int(payload.risk_score or 0) > 0 or payload.severity.upper() not in {"NONE", "LOW"}


async def _insert_proxy_decision_lightweight(payload: ProxyRecordRequest) -> int:
    explanation = f"{payload.explanation} [{format_proxy_capture_note(payload.protocol_mode)}]"
    normalized_sql = payload.sql
    pool = get_control_pool()
    async with pool.acquire() as conn:
        repo = QueryLogRepo(conn)
        query_id = await repo.insert(
            payload.sql,
            payload.db_user,
            payload.client_ip,
            payload.action,
            payload.severity,
            payload.risk_score,
            payload.detection_method,
            explanation,
            "PROXY",
            normalized_sql,
        )
        await repo.update_timings(
            query_id,
            float(payload.detection_ms or 0.0),
            0.0,
            0.0,
            float(payload.detection_ms or 0.0),
        )

    if _should_sync_lightweight_record(payload):
        await sync_service.request("query_processed", query_id=query_id)
    return query_id


async def _record_proxy_decision_detached(payload: ProxyRecordRequest) -> None:
    try:
        if _use_lightweight_proxy_record(payload):
            await _insert_proxy_decision_lightweight(payload)
            return

        pool = get_control_pool()
        async with pool.acquire() as conn:
            repos = SimpleNamespace(
                query_log=QueryLogRepo(conn),
                rule=RuleRepo(conn),
                alert=AlertRepo(conn),
                notification=NotificationRepo(conn),
                audit=AuditRepo(conn),
                feature=FeatureRepo(conn),
                baseline=BaselineRepo(conn),
                anomaly=AnomalyRepo(conn),
                feedback=FeedbackRepo(conn),
            )
            await _record_proxy_decision(payload, repos)
    except Exception as exc:
        logger.error(
            "proxy_record_background_failed",
            db_user=payload.db_user,
            action=payload.action,
            risk_score=payload.risk_score,
            sql=payload.sql[:200],
            error=str(exc),
        )


@router.post("/proxy/record", dependencies=[Depends(require_proxy_token)])
async def record_proxy_decision(payload: ProxyRecordRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    allowed_actions = {"ALLOW", "FLAG", "BLOCK", "ERROR"}
    allowed_severities = {"NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"}
    if payload.action not in allowed_actions:
        raise HTTPException(status_code=400, detail="Invalid proxy action.")
    if payload.severity not in allowed_severities:
        raise HTTPException(status_code=400, detail="Invalid proxy severity.")

    background_tasks.add_task(_record_proxy_decision_detached, payload)
    return {
        "status": "accepted",
        "recorded_async": True,
        "recording_path": "lightweight" if _use_lightweight_proxy_record(payload) else "full_pipeline",
    }
