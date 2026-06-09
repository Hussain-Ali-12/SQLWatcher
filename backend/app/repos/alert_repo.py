from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import AlertRecord
from app.repos._mapping import as_int, value


class AlertRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> AlertRecord:
        return AlertRecord(
            alert_id=as_int(row["alert_id"]),
            query_id=value(row, "query_id"),
            created_at=value(row, "created_at"),
            severity=str(value(row, "severity", "HIGH")),
            status=str(value(row, "status", "OPEN")),
            title=value(row, "title"),
            description=value(row, "description"),
            resolved_by=value(row, "resolved_by"),
            resolved_at=value(row, "resolved_at"),
            raw_sql=value(row, "raw_sql"),
            action_taken=value(row, "action_taken"),
            risk_score=value(row, "risk_score"),
            detection_method=value(row, "detection_method"),
        )

    async def insert(self, query_id: int, severity: str, title: str | None, description: str | None) -> int:
        """Insert an alert and return the new alert_id."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO alerts (query_id, severity, title, description)
            VALUES ($1,$2,$3,$4)
            RETURNING alert_id
            """,
            query_id,
            severity,
            title,
            description,
        )
        return as_int(row["alert_id"])

    async def get_many(self, status_filter: str | None, limit: int, offset: int) -> list[AlertRecord]:
        """Return alerts joined with query metadata."""
        limit = max(1, min(int(limit), 5000))
        offset = max(0, int(offset))
        args: list[Any] = [limit, offset]
        where = ""
        if status_filter:
            args.append(status_filter.upper())
            where = f"WHERE a.status = ${len(args)}"
        rows = await self.conn.fetch(
            f"""
            SELECT a.alert_id, a.query_id, a.created_at, a.severity, a.status,
                   a.title, a.description, a.resolved_by, a.resolved_at,
                   q.raw_sql, q.action_taken, q.risk_score, q.detection_method
            FROM alerts a
            JOIN query_logs q ON q.query_id = a.query_id
            {where}
            ORDER BY a.created_at DESC
            LIMIT $1 OFFSET $2
            """,
            *args,
        )
        return [self._to_record(row) for row in rows]

    async def get_by_id(self, alert_id: int) -> AlertRecord | None:
        """Return one alert joined with query metadata."""
        row = await self.conn.fetchrow(
            """
            SELECT a.alert_id, a.query_id, a.created_at, a.severity, a.status,
                   a.title, a.description, a.resolved_by, a.resolved_at,
                   q.raw_sql, q.action_taken, q.risk_score, q.detection_method
            FROM alerts a
            JOIN query_logs q ON q.query_id = a.query_id
            WHERE a.alert_id = $1
            """,
            alert_id,
        )
        return self._to_record(row) if row else None

    async def update_status(self, alert_id: int, status: str, resolved_by: str | None, notes: str | None = None) -> None:
        """Update alert status and resolution metadata."""
        _ = notes
        await self.conn.execute(
            """
            UPDATE alerts
            SET status = $2, resolved_by = $3, resolved_at = NOW()
            WHERE alert_id = $1
            """,
            alert_id,
            status,
            resolved_by,
        )

    async def get_open_count(self) -> int:
        """Return the current open alert count."""
        row = await self.conn.fetchrow("SELECT COUNT(*)::INT AS count FROM alerts WHERE status = 'OPEN'")
        return as_int(row["count"] if row else 0)
