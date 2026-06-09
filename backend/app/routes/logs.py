from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import get_current_user, require_roles
from app.dependencies.db import Repos, get_repos
from app.models.records import LogFilters, Pagination
from app.models.schemas import AlertDecisionRequest

router = APIRouter(prefix="/api", tags=["Logs and Alerts"])


def _record_dict(record) -> dict:
    return asdict(record)


@router.get("/logs")
async def get_logs(
    limit: int = 100,
    offset: int = 0,
    action: str | None = None,
    severity: str | None = None,
    current_user: dict = Depends(get_current_user),
    repos: Repos = Depends(get_repos),
):
    rows = await repos.query_log.get_many(
        LogFilters(action=action.upper() if action else None, severity=severity.upper() if severity else None),
        Pagination(limit=max(1, min(int(limit), 5000)), offset=max(0, int(offset))),
    )
    return [_record_dict(row) for row in rows]


@router.get("/logs/count")
async def get_logs_count(
    action: str | None = None,
    severity: str | None = None,
    current_user: dict = Depends(get_current_user),
    repos: Repos = Depends(get_repos),
):
    filters = LogFilters(action=action.upper() if action else None, severity=severity.upper() if severity else None)
    total = await repos.query_log.count(filters)
    return {"total": total, "action": filters.action, "severity": filters.severity}


@router.get("/logs/{query_id}")
async def get_log_detail(query_id: int, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    row = await repos.query_log.get_by_id(query_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Query log not found")
    result = _record_dict(row)
    feedback = await repos.feedback.get_by_query_id(query_id)
    features = await repos.feature.get_by_query_id(query_id)
    anomaly = await repos.anomaly.get_latest_for_query(query_id)
    result["feedback"] = [_record_dict(item) for item in feedback]
    result["features"] = _record_dict(features) if features else None
    result["anomaly"] = _record_dict(anomaly) if anomaly else None
    return result


@router.get("/logs/{query_id}/features")
async def get_log_features(query_id: int, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    features = await repos.feature.get_by_query_id(query_id)
    if features is None:
        raise HTTPException(status_code=404, detail="Feature vector not found")
    return _record_dict(features)


@router.get("/alerts")
async def get_alerts(
    limit: int = 100,
    offset: int = 0,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
    repos: Repos = Depends(get_repos),
):
    rows = await repos.alert.get_many(status.upper() if status else None, max(1, min(int(limit), 5000)), max(0, int(offset)))
    return [_record_dict(row) for row in rows]


@router.post("/alerts/{alert_id}/decision")
async def decide_alert(
    alert_id: int,
    payload: AlertDecisionRequest,
    current_user: dict = Depends(require_roles("admin", "analyst")),
    repos: Repos = Depends(get_repos),
):
    allowed = {"confirm_block", "allow_instance", "escalate", "false_positive"}
    if payload.decision not in allowed:
        raise HTTPException(status_code=400, detail=f"decision must be one of: {', '.join(sorted(allowed))}")

    alert = await repos.alert.get_by_id(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    new_status = "ESCALATED" if payload.decision == "escalate" else "RESOLVED"
    actor_name = current_user.get("email") or current_user.get("username") or payload.analyst_name
    await repos.alert.update_status(alert_id, new_status, actor_name, payload.notes)
    if alert.query_id is not None:
        await repos.feedback.insert(alert.query_id, actor_name, payload.decision, payload.notes)
    await repos.audit.insert(
        "ALERT_DECISION",
        f"Alert {alert_id} marked as {payload.decision}.",
        actor_id=int(current_user["user_id"]),
        actor_email=actor_name,
        actor_role=current_user.get("role"),
        entity_type="alert",
        entity_id=alert_id,
        metadata={"decision": payload.decision, "status": new_status},
    )
    return {
        "status": "saved",
        "alert_id": alert_id,
        "query_id": alert.query_id,
        "decision": payload.decision,
        "alert_status": new_status,
    }


@router.post("/feedback/{query_id}")
async def submit_feedback(
    query_id: int,
    feedback_type: str,
    notes: str = "",
    current_user: dict = Depends(require_roles("admin", "analyst")),
    repos: Repos = Depends(get_repos),
):
    actor_name = current_user.get("email") or current_user.get("username") or "analyst"
    await repos.feedback.insert(query_id, actor_name, feedback_type, notes)
    await repos.audit.insert(
        "QUERY_FEEDBACK",
        f"Feedback recorded for query {query_id}: {feedback_type}.",
        actor_id=int(current_user["user_id"]),
        actor_email=actor_name,
        actor_role=current_user.get("role"),
        entity_type="query_log",
        entity_id=query_id,
        metadata={"feedback_type": feedback_type},
    )
    return {"status": "saved", "query_id": query_id, "feedback_type": feedback_type}
