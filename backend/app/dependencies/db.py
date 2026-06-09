from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends

from app.core.database import get_control_db, get_target_db
from app.repos.alert_repo import AlertRepo
from app.repos.anomaly_repo import AnomalyRepo
from app.repos.audit_repo import AuditRepo
from app.repos.baseline_repo import BaselineRepo
from app.repos.config_repo import ConfigRepo
from app.repos.feature_repo import FeatureRepo
from app.repos.feedback_repo import FeedbackRepo
from app.repos.login_attempt_repo import LoginAttemptRepo
from app.repos.notification_repo import NotificationRepo
from app.repos.query_log_repo import QueryLogRepo
from app.repos.rule_repo import RuleRepo
from app.repos.session_repo import SessionRepo
from app.repos.stats_repo import StatsRepo
from app.repos.user_repo import UserRepo


@dataclass(frozen=True)
class Repos:
    query_log: QueryLogRepo
    alert: AlertRepo
    rule: RuleRepo
    user: UserRepo
    session: SessionRepo
    baseline: BaselineRepo
    feature: FeatureRepo
    anomaly: AnomalyRepo
    audit: AuditRepo
    notification: NotificationRepo
    feedback: FeedbackRepo
    stats: StatsRepo
    config: ConfigRepo
    login_attempt: LoginAttemptRepo


async def get_repos(conn=Depends(get_control_db)) -> Repos:
    return Repos(
        query_log=QueryLogRepo(conn),
        alert=AlertRepo(conn),
        rule=RuleRepo(conn),
        user=UserRepo(conn),
        session=SessionRepo(conn),
        baseline=BaselineRepo(conn),
        feature=FeatureRepo(conn),
        anomaly=AnomalyRepo(conn),
        audit=AuditRepo(conn),
        notification=NotificationRepo(conn),
        feedback=FeedbackRepo(conn),
        stats=StatsRepo(conn),
        config=ConfigRepo(conn),
        login_attempt=LoginAttemptRepo(conn),
    )


__all__ = ["Repos", "get_repos", "get_control_db", "get_target_db"]
