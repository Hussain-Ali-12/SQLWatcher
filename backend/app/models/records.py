from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class Pagination:
    """Limit/offset pagination parameters used by repositories."""

    limit: int = 100
    offset: int = 0


@dataclass(frozen=True)
class LogFilters:
    """Optional query-log filters."""

    action: str | None = None
    severity: str | None = None


@dataclass(frozen=True)
class RuleCreatePayload:
    """Repository-safe payload for creating a rule."""

    rule_name: str
    description: str
    severity: str
    action: str
    enabled: bool = True
    rule_type: str = "KEYWORD"
    match_pattern: str | None = None
    match_target: str = "RAW_SQL"
    risk_score: int = 50
    is_system: bool = False


@dataclass(frozen=True)
class RuleUpdatePayload:
    """Repository-safe payload for updating a rule; None means unchanged."""

    rule_name: str | None = None
    description: str | None = None
    severity: str | None = None
    action: str | None = None
    enabled: bool | None = None
    rule_type: str | None = None
    match_pattern: str | None = None
    match_target: str | None = None
    risk_score: int | None = None
    is_system: bool | None = None


@dataclass(frozen=True)
class QueryLogRecord:
    query_id: int
    timestamp: datetime | None
    client_ip: str | None
    db_user: str | None
    raw_sql: str
    normalized_sql: str | None
    query_type: str | None
    risk_score: int
    severity: str
    detection_method: str | None
    action_taken: str
    explanation: str | None
    detection_ms: float = 0.0
    anomaly_ms: float = 0.0
    execution_ms: float = 0.0
    total_ms: float = 0.0
    anomaly_score: int = 0


@dataclass(frozen=True)
class AlertRecord:
    alert_id: int
    query_id: int | None
    created_at: datetime | None
    severity: str
    status: str
    title: str | None
    description: str | None
    resolved_by: str | None
    resolved_at: datetime | None
    raw_sql: str | None = None
    action_taken: str | None = None
    risk_score: int | None = None
    detection_method: str | None = None


@dataclass(frozen=True)
class RuleRecord:
    rule_id: int
    rule_name: str
    description: str | None
    severity: str
    action: str
    enabled: bool
    trigger_count: int
    created_at: datetime | None
    rule_type: str
    match_pattern: str | None
    match_target: str
    risk_score: int
    is_system: bool
    updated_at: datetime | None


@dataclass(frozen=True)
class UserRecord:
    user_id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    password_hash: str | None = field(default=None, repr=False, compare=False)


@dataclass(frozen=True)
class SessionRecord:
    token_hash: str
    user_id: int
    expires_at: datetime
    revoked_at: datetime | None
    created_at: datetime | None = None
    user: UserRecord | None = None


@dataclass(frozen=True)
class BaselineProfileRecord:
    profile_id: int | None
    db_user: str | None
    sample_count: int
    query_type_distribution: Mapping[str, Any]
    common_tables: Sequence[str]
    avg_table_count: float
    avg_where_conditions: float
    avg_has_limit: float
    avg_has_select_star: float
    avg_sensitive_table_count: float
    avg_risk_score: float
    normal_hours: Sequence[int]
    model_version: str | None
    ml_enabled: bool
    ml_algorithm: str | None
    ml_model: bytes | None
    ml_feature_schema: Mapping[str, Any]
    ml_training_error: str | None
    updated_at: datetime | None


@dataclass(frozen=True)
class QueryFeaturesRecord:
    feature_id: int
    query_id: int | None
    db_user: str | None
    query_type: str | None
    table_names: Sequence[str] | None
    table_count: int
    sensitive_table_count: int
    has_select_star: bool
    has_limit: bool
    where_condition_count: int
    hour_of_day: int | None
    keyword_count: int
    created_at: datetime | None


@dataclass(frozen=True)
class AnomalyScoreRecord:
    anomaly_id: int
    query_id: int | None
    db_user: str | None
    anomaly_score: int
    anomaly_reasons: list[str]
    baseline_available: bool
    statistical_score: int
    ml_anomaly_score: int
    anomaly_category: str
    baseline_maturity: str
    anomaly_confidence: str
    ml_model_available: bool
    model_version: str | None
    created_at: datetime | None
    raw_sql: str | None = None
    action_taken: str | None = None
    severity: str | None = None
    latest_feedback: str | None = None
    feedback_count: int = 0


@dataclass(frozen=True)
class AuditEventRecord:
    event_id: int
    timestamp: datetime | None
    actor_email: str | None
    actor_role: str | None
    event_type: str
    entity_type: str | None
    entity_id: str | None
    description: str | None
    metadata_json: Any


@dataclass(frozen=True)
class NotificationRecord:
    notification_id: int
    alert_id: int | None
    created_at: datetime | None
    title: str
    message: str | None
    severity: str | None
    is_read: bool


@dataclass(frozen=True)
class FeedbackRecord:
    feedback_id: int
    query_id: int | None
    anomaly_id: int | None
    analyst_name: str | None
    feedback_type: str | None
    notes: str | None
    applied: bool
    metadata_json: Mapping[str, Any] | str | None
    created_at: datetime | None


@dataclass(frozen=True)
class StatsRecord:
    total_queries: int
    allowed_queries: int
    flagged_queries: int
    blocked_queries: int
    critical_alerts: int
    high_alerts: int
    average_risk_score: float
    open_alerts: int
    anomaly_scores: int
    max_anomaly_score: int
    medium_alerts: int = 0
    low_alerts: int = 0


@dataclass(frozen=True)
class TimelineBinRecord:
    hour: datetime
    allowed: int
    flagged: int
    blocked: int
    total: int = 0
    average_risk: float = 0.0


@dataclass(frozen=True)
class PerformanceRecord:
    # total_samples is kept for backward compatibility with the existing frontend contract.
    # It now represents total recorded query logs, not only rows with timing data.
    total_samples: int
    total_queries: int
    timed_samples: int
    avg_total_ms: float
    avg_detection_ms: float
    avg_anomaly_ms: float
    avg_execution_ms: float
    min_total_ms: float
    max_total_ms: float
    p50_total_ms: float
    p95_total_ms: float
    p99_total_ms: float
    allow_count: int
    flag_count: int
    block_count: int
    error_count: int


@dataclass(frozen=True)
class LoginAttemptRecord:
    ip: str
    attempted_at: datetime
    attempt_id: int | None = None


@dataclass(frozen=True)
class RuleTriggerHistoryRecord:
    rule_name: str
    trigger_date: date
    trigger_count: int
    history_id: int | None = None
