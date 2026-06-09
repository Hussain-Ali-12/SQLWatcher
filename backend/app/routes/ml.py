from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.dependencies.auth import get_current_user, require_roles
from app.dependencies.db import Repos, get_repos
from app.ml.baseline_model import get_baseline_profiles, get_recent_anomaly_scores
from app.services.anomaly_policy import get_anomaly_policy
from app.services.audit_service import AuditService
from app.services.ml_service import MLService
from app.services.realtime_sync import force_realtime_sync

router = APIRouter(prefix="/api/ml", tags=["ML and Anomaly Baseline"])

VALID_ANOMALY_FEEDBACK = {
    "CONFIRM_ANOMALY",
    "EXPECTED_BEHAVIOR",
    "FALSE_POSITIVE",
    "ADD_TO_BASELINE",
    "CREATE_RULE_SUGGESTION",
}


class AnomalyFeedbackPayload(BaseModel):
    query_id: int = Field(..., ge=1)
    anomaly_id: int | None = Field(default=None, ge=1)
    feedback_type: str = Field(..., max_length=64)
    notes: str | None = Field(default=None, max_length=1000)


def _evaluate_anomaly_readiness(profiles: list[dict], anomalies: list[dict], feedback_count: int, policy: dict) -> dict:
    total_profiles = len(profiles)
    ml_profiles = len([p for p in profiles if p.get("ml_enabled")])
    high_confidence_profiles = len([p for p in profiles if str(p.get("baseline_confidence", "")).upper() == "HIGH"])
    learning_profiles = len([p for p in profiles if "LEARNING" in str(p.get("baseline_maturity", "")).upper()])
    stale_profiles = len([p for p in profiles if "STALE" in str(p.get("baseline_maturity", "")).upper()])
    high_anomalies = len([a for a in anomalies if int(a.get("anomaly_score") or 0) >= 70])
    max_anomaly_score = max([int(a.get("anomaly_score") or 0) for a in anomalies], default=0)
    checks = [
        {"name": "Anomaly runtime policy", "status": "PASS" if policy.get("enabled") else "CHECK", "detail": "Enabled" if policy.get("enabled") else "Disabled - rule-only latency mode is active."},
        {"name": "Baseline profiles", "status": "PASS" if total_profiles > 0 else "CHECK", "detail": f"{total_profiles} baseline profile(s) available."},
        {"name": "Real ML profiles", "status": "PASS" if ml_profiles > 0 else "CHECK", "detail": f"{ml_profiles} profile(s) have Isolation Forest enabled."},
        {"name": "Maturity", "status": "PASS" if high_confidence_profiles > 0 else "CHECK", "detail": f"{high_confidence_profiles} high-confidence profile(s), {learning_profiles} learning profile(s), {stale_profiles} stale profile(s)."},
        {"name": "Analyst feedback loop", "status": "PASS" if feedback_count > 0 else "CHECK", "detail": f"{feedback_count} feedback record(s) captured."},
        {"name": "Recent anomaly evidence", "status": "PASS" if anomalies else "CHECK", "detail": f"{len(anomalies)} recent anomaly score(s), max score {max_anomaly_score}."},
    ]
    if all(item["status"] == "PASS" for item in checks):
        status = "READY"
    elif total_profiles > 0 and ml_profiles > 0 and policy.get("enabled"):
        status = "DEMO_READY_WITH_WARNINGS"
    else:
        status = "NEEDS_BASELINE_DATA"
    recommendations: list[str] = []
    if not policy.get("enabled"):
        recommendations.append("Enable anomaly detection from Settings when demonstrating ML behavior.")
    if total_profiles == 0:
        recommendations.append("Generate SecureShop baseline traffic, then refresh baselines in SQLWatcher.")
    if ml_profiles == 0 and total_profiles > 0:
        recommendations.append("Generate more clean baseline samples so Isolation Forest can train.")
    if feedback_count == 0:
        recommendations.append("Use analyst feedback controls to demonstrate the feedback loop.")
    return {
        "status": status,
        "summary": {
            "total_profiles": total_profiles,
            "ml_profiles": ml_profiles,
            "high_confidence_profiles": high_confidence_profiles,
            "learning_profiles": learning_profiles,
            "stale_profiles": stale_profiles,
            "recent_anomalies": len(anomalies),
            "high_anomalies": high_anomalies,
            "max_anomaly_score": max_anomaly_score,
            "feedback_count": feedback_count,
        },
        "checks": checks,
        "recommendations": recommendations,
    }


@router.post("/train-baseline")
async def train(db_user: str | None = None, include_allows_only: bool = True, current_user: dict = Depends(require_roles("admin", "analyst")), repos: Repos = Depends(get_repos)):
    result = await MLService().retrain(db_user=db_user, includes_allows_only=include_allows_only)
    await AuditService(repos.audit).log("BASELINE_TRAINED", f"Baseline training completed for {db_user or 'all users'}.", actor=current_user, entity_type="baseline_profiles", metadata={"trained_profiles": result.get("trained_profiles", 0), "db_user": db_user})
    await force_realtime_sync("baseline_trained", message="Baseline training completed.", trained_profiles=result.get("trained_profiles", 0), db_user=db_user or "all", actor=current_user.get("username", current_user.get("email")))
    return result


@router.post("/anomaly-feedback")
async def submit_anomaly_feedback(payload: AnomalyFeedbackPayload, current_user: dict = Depends(require_roles("admin", "analyst")), repos: Repos = Depends(get_repos)):
    feedback_type = payload.feedback_type.upper().strip()
    if feedback_type not in VALID_ANOMALY_FEEDBACK:
        raise HTTPException(status_code=422, detail=f"Unsupported anomaly feedback type: {payload.feedback_type}")
    query = await repos.query_log.get_by_id(payload.query_id)
    if query is None:
        raise HTTPException(status_code=404, detail="Query log not found for feedback.")
    if payload.anomaly_id:
        anomaly = await repos.anomaly.get_by_id(payload.anomaly_id)
        if anomaly is None or anomaly.query_id != payload.query_id:
            raise HTTPException(status_code=404, detail="Anomaly score not found for this query.")
    actor_name = current_user.get("email") or current_user.get("username") or "analyst"
    await repos.feedback.insert(payload.query_id, actor_name, feedback_type, payload.notes)
    if feedback_type in {"EXPECTED_BEHAVIOR", "FALSE_POSITIVE", "ADD_TO_BASELINE"}:
        await repos.alert.update_open_status_by_query(payload.query_id, "RESOLVED", actor_name)
    if feedback_type == "CONFIRM_ANOMALY":
        await repos.alert.update_open_status_by_query(payload.query_id, "ESCALATED", actor_name)
    await AuditService(repos.audit).log("ANOMALY_FEEDBACK_RECORDED", f"Analyst feedback recorded: {feedback_type}.", actor=current_user, entity_type="query_log", entity_id=payload.query_id, metadata={"feedback_type": feedback_type, "anomaly_id": payload.anomaly_id, "notes": payload.notes})
    await force_realtime_sync("anomaly_feedback_recorded", message="Anomaly feedback recorded.", query_id=payload.query_id, feedback_type=feedback_type, actor=actor_name)
    feedback = (await repos.feedback.get_by_query_id(payload.query_id))[0]
    return asdict(feedback)


@router.get("/anomaly-feedback")
async def list_anomaly_feedback(query_id: int | None = None, limit: int = 50, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return [asdict(row) for row in await repos.feedback.get_many(query_id=query_id, limit=max(1, min(int(limit), 200)))]


@router.get("/evaluation-summary")
async def evaluation_summary(current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    profiles = await get_baseline_profiles()
    anomalies = await get_recent_anomaly_scores(limit=50)
    policy = await get_anomaly_policy()
    feedback_count = await repos.feedback.count()
    readiness = _evaluate_anomaly_readiness(profiles, anomalies, feedback_count, policy)
    return {"readiness": readiness, "policy": policy}


@router.get("/profiles")
async def profiles(current_user: dict = Depends(get_current_user)):
    return await get_baseline_profiles()


@router.get("/anomaly-scores")
async def anomaly_scores(limit: int = 50, current_user: dict = Depends(get_current_user)):
    return await get_recent_anomaly_scores(limit=max(1, min(int(limit), 200)))


@router.get("/health")
async def ml_health(current_user: dict = Depends(get_current_user)):
    return await MLService().get_model_health()
