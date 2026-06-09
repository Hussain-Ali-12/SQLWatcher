from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import AnomalyScoreRecord
from app.repos._mapping import as_bool, as_int, value


class AnomalyRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> AnomalyScoreRecord:
        return AnomalyScoreRecord(
            anomaly_id=as_int(row["anomaly_id"]),
            query_id=value(row, "query_id"),
            db_user=value(row, "db_user"),
            anomaly_score=as_int(value(row, "anomaly_score")),
            anomaly_reasons=list(value(row, "anomaly_reasons", []) or []),
            baseline_available=as_bool(value(row, "baseline_available")),
            statistical_score=as_int(value(row, "statistical_score")),
            ml_anomaly_score=as_int(value(row, "ml_anomaly_score")),
            anomaly_category=str(value(row, "anomaly_category", "NORMAL")),
            baseline_maturity=str(value(row, "baseline_maturity", "UNKNOWN")),
            anomaly_confidence=str(value(row, "anomaly_confidence", "UNKNOWN")),
            ml_model_available=as_bool(value(row, "ml_model_available")),
            model_version=value(row, "model_version"),
            created_at=value(row, "created_at"),
            raw_sql=value(row, "raw_sql"),
            action_taken=value(row, "action_taken"),
            severity=value(row, "severity"),
            latest_feedback=value(row, "latest_feedback"),
            feedback_count=as_int(value(row, "feedback_count")),
        )

    async def insert(
        self,
        query_id: int,
        db_user: str | None,
        score: int,
        reasons: list[str],
        baseline_available: bool = False,
        statistical_score: int = 0,
        ml_anomaly_score: int = 0,
        anomaly_category: str = "NORMAL",
        baseline_maturity: str = "UNKNOWN",
        anomaly_confidence: str = "UNKNOWN",
        ml_model_available: bool = False,
        model_version: str = "statistical-v1",
    ) -> int:
        """Insert an anomaly score and return the new anomaly_id."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO anomaly_scores
              (query_id, db_user, anomaly_score, anomaly_reasons, baseline_available,
               statistical_score, ml_anomaly_score, anomaly_category, baseline_maturity,
               anomaly_confidence, ml_model_available, model_version)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING anomaly_id
            """,
            query_id,
            db_user,
            score,
            reasons,
            baseline_available,
            statistical_score,
            ml_anomaly_score,
            anomaly_category,
            baseline_maturity,
            anomaly_confidence,
            ml_model_available,
            model_version,
        )
        return as_int(row["anomaly_id"])

    async def get_many(self, limit: int, offset: int = 0) -> list[AnomalyScoreRecord]:
        """Return recent anomaly scores with query and feedback summary."""
        rows = await self.conn.fetch(
            """
            SELECT a.*, q.raw_sql, q.action_taken, q.severity,
                   fb.feedback_type AS latest_feedback,
                   COALESCE(fbc.feedback_count, 0)::INT AS feedback_count
            FROM anomaly_scores a
            LEFT JOIN query_logs q ON q.query_id = a.query_id
            LEFT JOIN LATERAL (
                SELECT feedback_type
                FROM analyst_feedback
                WHERE query_id = a.query_id OR anomaly_id = a.anomaly_id
                ORDER BY created_at DESC
                LIMIT 1
            ) fb ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::INT AS feedback_count
                FROM analyst_feedback
                WHERE query_id = a.query_id OR anomaly_id = a.anomaly_id
            ) fbc ON TRUE
            ORDER BY a.created_at DESC
            LIMIT $1 OFFSET $2
            """,
            max(1, min(int(limit), 5000)),
            max(0, int(offset)),
        )
        return [self._to_record(row) for row in rows]


    async def get_by_id(self, anomaly_id: int) -> AnomalyScoreRecord | None:
        """Return an anomaly score by anomaly_id."""
        row = await self.conn.fetchrow(
            """
            SELECT a.*, q.raw_sql, q.action_taken, q.severity,
                   fb.feedback_type AS latest_feedback,
                   COALESCE(fbc.feedback_count, 0)::INT AS feedback_count
            FROM anomaly_scores a
            LEFT JOIN query_logs q ON q.query_id = a.query_id
            LEFT JOIN LATERAL (
                SELECT feedback_type
                FROM analyst_feedback
                WHERE query_id = a.query_id OR anomaly_id = a.anomaly_id
                ORDER BY created_at DESC
                LIMIT 1
            ) fb ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::INT AS feedback_count
                FROM analyst_feedback
                WHERE query_id = a.query_id OR anomaly_id = a.anomaly_id
            ) fbc ON TRUE
            WHERE a.anomaly_id = $1
            """,
            int(anomaly_id),
        )
        return self._to_record(row) if row else None

    async def get_by_query_id(self, query_id: int) -> AnomalyScoreRecord | None:
        """Return the oldest anomaly score for a query."""
        row = await self.conn.fetchrow(
            "SELECT * FROM anomaly_scores WHERE query_id = $1 ORDER BY created_at ASC LIMIT 1",
            query_id,
        )
        return self._to_record(row) if row else None

    async def get_latest_for_query(self, query_id: int) -> AnomalyScoreRecord | None:
        """Return the latest anomaly score for a query."""
        row = await self.conn.fetchrow(
            "SELECT * FROM anomaly_scores WHERE query_id = $1 ORDER BY created_at DESC LIMIT 1",
            query_id,
        )
        return self._to_record(row) if row else None
