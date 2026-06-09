from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import LogFilters, Pagination, QueryLogRecord
from app.repos._mapping import as_float, as_int, value


class QueryLogRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> QueryLogRecord:
        return QueryLogRecord(
            query_id=as_int(row["query_id"]),
            timestamp=value(row, "timestamp"),
            client_ip=value(row, "client_ip"),
            db_user=value(row, "db_user"),
            raw_sql=str(value(row, "raw_sql", "")),
            normalized_sql=value(row, "normalized_sql"),
            query_type=value(row, "query_type"),
            risk_score=as_int(value(row, "risk_score")),
            severity=str(value(row, "severity", "NONE")),
            detection_method=value(row, "detection_method"),
            action_taken=str(value(row, "action_taken", "ALLOW")),
            explanation=value(row, "explanation"),
            detection_ms=as_float(value(row, "detection_ms")),
            anomaly_ms=as_float(value(row, "anomaly_ms")),
            execution_ms=as_float(value(row, "execution_ms")),
            total_ms=as_float(value(row, "total_ms")),
            anomaly_score=as_int(value(row, "anomaly_score")),
        )

    async def insert(
        self,
        sql: str,
        db_user: str | None,
        client_ip: str | None,
        action: str,
        severity: str,
        risk_score: int,
        detection_method: str | None,
        explanation: str | None,
        query_type: str | None,
        normalized_sql: str | None,
    ) -> int:
        """Insert a query log row and return the new query_id."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO query_logs
              (raw_sql, db_user, client_ip, action_taken, severity, risk_score,
               detection_method, explanation, query_type, normalized_sql)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING query_id
            """,
            sql,
            db_user,
            client_ip,
            action,
            severity,
            risk_score,
            detection_method,
            explanation,
            query_type,
            normalized_sql,
        )
        return as_int(row["query_id"])

    async def get_many(self, filters: LogFilters, pagination: Pagination) -> list[QueryLogRecord]:
        """Return query logs with optional action/severity filtering."""
        limit = max(1, min(int(pagination.limit), 5000))
        offset = max(0, int(pagination.offset))
        args: list[Any] = [limit, offset]
        conditions: list[str] = []
        if filters.action:
            args.append(filters.action.upper())
            conditions.append(f"q.action_taken = ${len(args)}")
        if filters.severity:
            args.append(filters.severity.upper())
            conditions.append(f"q.severity = ${len(args)}")
        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        rows = await self.conn.fetch(
            f"""
            SELECT q.query_id, q.timestamp, q.client_ip, q.db_user, q.raw_sql, q.normalized_sql,
                   q.query_type, q.risk_score, q.severity, q.detection_method, q.action_taken,
                   q.explanation, q.detection_ms, q.anomaly_ms, q.execution_ms, q.total_ms,
                   COALESCE(a.anomaly_score, 0) AS anomaly_score
            FROM query_logs q
            LEFT JOIN LATERAL (
                SELECT anomaly_score
                FROM anomaly_scores
                WHERE query_id = q.query_id
                ORDER BY created_at DESC
                LIMIT 1
            ) a ON TRUE
            {where_clause}
            ORDER BY q.timestamp DESC
            LIMIT $1 OFFSET $2
            """,
            *args,
        )
        return [self._to_record(row) for row in rows]


    async def count(self, filters: LogFilters) -> int:
        """Return the total number of query logs matching optional filters."""
        args: list[Any] = []
        conditions: list[str] = []
        if filters.action:
            args.append(filters.action.upper())
            conditions.append(f"action_taken = ${len(args)}")
        if filters.severity:
            args.append(filters.severity.upper())
            conditions.append(f"severity = ${len(args)}")
        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        row = await self.conn.fetchrow(
            f"""
            SELECT COUNT(*)::INT AS count
            FROM query_logs
            {where_clause}
            """,
            *args,
        )
        return as_int(row["count"]) if row else 0

    async def get_by_id(self, query_id: int) -> QueryLogRecord | None:
        """Return one query log by ID, including the latest anomaly score."""
        row = await self.conn.fetchrow(
            """
            SELECT q.query_id, q.timestamp, q.client_ip, q.db_user, q.raw_sql, q.normalized_sql,
                   q.query_type, q.risk_score, q.severity, q.detection_method, q.action_taken,
                   q.explanation, q.detection_ms, q.anomaly_ms, q.execution_ms, q.total_ms,
                   COALESCE(a.anomaly_score, 0) AS anomaly_score
            FROM query_logs q
            LEFT JOIN LATERAL (
                SELECT anomaly_score
                FROM anomaly_scores
                WHERE query_id = q.query_id
                ORDER BY created_at DESC
                LIMIT 1
            ) a ON TRUE
            WHERE q.query_id = $1
            """,
            query_id,
        )
        return self._to_record(row) if row else None

    async def update_timings(
        self,
        query_id: int,
        detection_ms: float,
        anomaly_ms: float,
        execution_ms: float,
        total_ms: float,
    ) -> None:
        """Update timing metrics on an existing query log."""
        await self.conn.execute(
            """
            UPDATE query_logs
            SET detection_ms = $2, anomaly_ms = $3, execution_ms = $4, total_ms = $5
            WHERE query_id = $1
            """,
            query_id,
            detection_ms,
            anomaly_ms,
            execution_ms,
            total_ms,
        )

    async def update_decision(
        self,
        query_id: int,
        action: str,
        severity: str,
        explanation: str | None,
    ) -> None:
        """Patch the final action, severity, and explanation for a query log row."""
        await self.conn.execute(
            """
            UPDATE query_logs
            SET action_taken = $2,
                severity = $3,
                explanation = $4
            WHERE query_id = $1
            """,
            query_id,
            action,
            severity,
            explanation,
        )

    async def get_distinct_db_users(self) -> list[str]:
        """Return distinct DB users with query log history."""
        rows = await self.conn.fetch(
            """
            SELECT DISTINCT db_user
            FROM query_logs
            WHERE db_user IS NOT NULL
            ORDER BY db_user ASC
            """
        )
        return [str(row["db_user"]) for row in rows]

    async def get_training_rows(self, db_user: str, include_allows_only: bool, max_risk_score: int, max_anomaly_score: int) -> list[dict[str, Any]]:
        """Return query rows eligible for baseline training."""
        rows = await self.conn.fetch(
            """
            SELECT q.raw_sql, q.db_user, q.timestamp, q.risk_score, q.action_taken
            FROM query_logs q
            WHERE q.db_user = $1
              AND (
                $2::BOOLEAN = FALSE
                OR (
                  q.action_taken = 'ALLOW'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM analyst_feedback af_block
                    WHERE af_block.query_id = q.query_id
                      AND af_block.feedback_type IN ('CONFIRM_ANOMALY', 'CONFIRMED_ANOMALY')
                  )
                  AND (
                    (
                      COALESCE(q.risk_score, 0) <= $3
                      AND NOT EXISTS (
                        SELECT 1
                        FROM anomaly_scores a
                        WHERE a.query_id = q.query_id
                          AND COALESCE(a.anomaly_score, 0) > $4
                      )
                    )
                    OR EXISTS (
                      SELECT 1
                      FROM analyst_feedback af_allow
                      WHERE af_allow.query_id = q.query_id
                        AND af_allow.feedback_type IN ('EXPECTED_BEHAVIOR', 'FALSE_POSITIVE', 'ADD_TO_BASELINE')
                    )
                  )
                )
              )
            ORDER BY q.timestamp ASC
            """,
            db_user,
            include_allows_only,
            max_risk_score,
            max_anomaly_score,
        )
        return [dict(row) for row in rows]
