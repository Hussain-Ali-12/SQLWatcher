from __future__ import annotations

from typing import Any

from app.models.records import AnomalyScoreRecord
from app.repos.anomaly_repo import AnomalyRepo
from app.repos.baseline_repo import BaselineRepo
from app.repos.feedback_repo import FeedbackRepo


class AnomalyService:
    def __init__(self, anomaly_repo: AnomalyRepo, baseline_repo: BaselineRepo, feedback_repo: FeedbackRepo | None = None) -> None:
        self.anomaly_repo = anomaly_repo
        self.baseline_repo = baseline_repo
        self.feedback_repo = feedback_repo

    async def score(self, query_id: int, context: Any) -> AnomalyScoreRecord | None:
        from app.ml.baseline_model import score_query_against_baseline

        features = getattr(context, "features", None) or {}
        db_user = getattr(context, "db_user", "web_app")
        result = await score_query_against_baseline(query_id, db_user, features)
        return await self.anomaly_repo.get_latest_for_query(query_id)

    async def record_feedback(
        self,
        query_id: int,
        anomaly_id: int | None,
        feedback_type: str,
        notes: str | None,
        analyst: str,
    ) -> None:
        if self.feedback_repo is None:
            return
        await self.feedback_repo.insert(query_id, analyst, feedback_type, notes)
