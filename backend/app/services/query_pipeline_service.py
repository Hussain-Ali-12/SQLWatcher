from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.logging import get_logger
from app.models.records import UserRecord
from app.models.schemas import DetectionResult
from app.repos.alert_repo import AlertRepo
from app.repos.feature_repo import FeatureRepo
from app.repos.query_log_repo import QueryLogRepo
from app.services.anomaly_policy import get_anomaly_policy
from app.services.anomaly_service import AnomalyService
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService
from app.services.rule_service import RuleService
from app.services.websocket_manager import WebSocketManager
from app.services.realtime_sync import RealtimeSync

logger = get_logger(__name__)


def _severity_for_anomaly(score: int, fallback: str) -> str:
    if score >= 90:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if fallback and fallback != "NONE":
        return fallback
    return "MEDIUM"


def _append_anomaly_explanation(explanation: str, score: int, mode: str, threshold: int) -> str:
    suffix = (
        f"Baseline anomaly score {score} met threshold {threshold}; "
        f"anomaly enforcement mode={mode}."
    )
    if suffix in explanation:
        return explanation
    return f"{explanation} {suffix}".strip()


@dataclass(frozen=True)
class QueryContext:
    sql: str
    db_user: str
    client_ip: str
    result: DetectionResult
    actor: UserRecord | dict[str, Any] | None = None
    features: dict[str, Any] = field(default_factory=dict)
    timings: dict[str, float] = field(default_factory=dict)
    execution_error: str | None = None


class QueryPipeline:
    def __init__(
        self,
        query_log_repo: QueryLogRepo,
        feature_repo: FeatureRepo,
        anomaly_service: AnomalyService,
        alert_repo: AlertRepo,
        notification_service: NotificationService,
        audit_service: AuditService,
        rule_service: RuleService,
        ws_manager: WebSocketManager,
        sync_service: RealtimeSync,
    ) -> None:
        self.query_log_repo = query_log_repo
        self.feature_repo = feature_repo
        self.anomaly_service = anomaly_service
        self.alert_repo = alert_repo
        self.notification_service = notification_service
        self.audit_service = audit_service
        self.rule_service = rule_service
        self.ws_manager = ws_manager
        self.sync_service = sync_service

    async def run(self, context: QueryContext) -> int:
        """Execute the post-decision pipeline and return query_id."""
        final_action = "ERROR" if context.execution_error else context.result.action
        final_severity = "LOW" if context.execution_error and context.result.severity == "NONE" else context.result.severity
        final_explanation = (
            f"{context.result.explanation} Database execution failed: {context.execution_error}"
            if context.execution_error else context.result.explanation
        )
        query_id = await self.query_log_repo.insert(
            context.sql,
            context.db_user,
            context.client_ip,
            final_action,
            final_severity,
            context.result.risk_score,
            context.result.detection_method,
            final_explanation,
            context.result.query_type,
            context.result.normalized_sql,
        )

        try:
            await self.feature_repo.insert(query_id, context.features)
        except Exception as exc:
            logger.warning("query_pipeline_feature_insert_failed", query_id=query_id, error=str(exc))

        anomaly = None
        try:
            anomaly = await self.anomaly_service.score(query_id, context)
        except Exception as exc:
            logger.warning("query_pipeline_anomaly_score_failed", query_id=query_id, error=str(exc))

        final_risk_score = int(context.result.risk_score or 0)
        final_detection_method = context.result.detection_method

        if anomaly is not None:
            try:
                policy = await get_anomaly_policy()
            except Exception as exc:
                logger.warning("query_pipeline_anomaly_policy_failed", query_id=query_id, error=str(exc))
                policy = {"enabled": True, "enforcement_mode": "flag", "min_score": 70}

            anomaly_score = int(getattr(anomaly, "anomaly_score", 0) or 0)
            threshold = int(policy.get("min_score") or 70)
            mode = str(policy.get("enforcement_mode") or "flag").lower()
            enabled = bool(policy.get("enabled", True))

            # Anomaly policy is applied after the initial rule/DB decision is recorded.
            # A query can arrive here as ERROR when the target database rejected it
            # (for example, invalid columns), but it can still be anomalous enough
            # to deserve a BLOCK classification in SQLWatcher. Do not skip ERROR
            # rows in block mode; promote them so the analyst view reflects the
            # policy decision instead of only the target DB failure.
            if enabled and anomaly_score >= threshold and final_action != "BLOCK":
                previous_action = final_action
                previous_method = final_detection_method
                final_risk_score = max(final_risk_score, anomaly_score)

                if mode == "block":
                    final_action = "BLOCK"
                    final_severity = _severity_for_anomaly(anomaly_score, final_severity)
                    final_detection_method = "BASELINE_ANOMALY"
                    final_explanation = _append_anomaly_explanation(final_explanation, anomaly_score, "block", threshold)
                    if previous_action == "ERROR":
                        final_explanation = (
                            f"{final_explanation} Target database execution also failed; "
                            "SQLWatcher classified the recorded decision as BLOCK because the baseline anomaly policy matched."
                        )
                    elif previous_method and previous_method != "NONE":
                        final_explanation = (
                            f"{final_explanation} Original rule signal: {previous_method}."
                        )
                elif mode == "flag":
                    if final_action == "ALLOW":
                        final_action = "FLAG"
                    final_severity = _severity_for_anomaly(anomaly_score, final_severity)
                    final_detection_method = (
                        final_detection_method
                        if final_detection_method and final_detection_method != "NONE"
                        else "BASELINE_ANOMALY"
                    )
                    final_explanation = _append_anomaly_explanation(final_explanation, anomaly_score, "flag", threshold)
                else:
                    final_explanation = _append_anomaly_explanation(final_explanation, anomaly_score, "observe", threshold)

                if mode in {"block", "flag"}:
                    try:
                        await self.query_log_repo.update_decision(
                            query_id,
                            final_action,
                            final_severity,
                            final_explanation,
                        )
                    except Exception as exc:
                        logger.warning("query_pipeline_decision_update_failed", query_id=query_id, error=str(exc))

        try:
            await self.audit_service.log(
                "QUERY_SUBMITTED",
                f"Query submitted through SQLWatcher with action {final_action}.",
                actor=context.actor if isinstance(context.actor, dict) else None,
                entity_type="query_log",
                entity_id=query_id,
                metadata={"db_user": context.db_user, "action": final_action, "risk_score": final_risk_score},
            )
        except Exception as exc:
            logger.warning("query_pipeline_audit_failed", query_id=query_id, error=str(exc))

        should_alert = final_action in {"FLAG", "BLOCK", "ERROR"}
        if should_alert:
            alert_id = await self.alert_repo.insert(query_id, final_severity, f"{final_severity} SQLWatcher Alert", final_explanation)
            await self.notification_service.create(alert_id, f"{final_severity} SQLWatcher Alert", final_explanation, final_severity)
            await self.ws_manager.broadcast_alert(alert_id, query_id, final_severity, context.sql, final_explanation)

        await self.rule_service.increment_triggers(final_detection_method or context.result.detection_method)
        await self.sync_service.request("query_processed", query_id=query_id)
        return query_id
