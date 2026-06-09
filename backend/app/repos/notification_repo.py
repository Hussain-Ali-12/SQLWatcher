from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import NotificationRecord
from app.repos._mapping import as_bool, as_int, value


class NotificationRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> NotificationRecord:
        return NotificationRecord(
            notification_id=as_int(row["notification_id"]),
            alert_id=value(row, "alert_id"),
            created_at=value(row, "created_at"),
            title=str(row["title"]),
            message=value(row, "message"),
            severity=value(row, "severity"),
            is_read=as_bool(value(row, "is_read")),
        )

    async def insert(self, alert_id: int, title: str, message: str | None, severity: str | None) -> int:
        """Insert a notification event and return notification_id."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO notification_events (alert_id, title, message, severity)
            VALUES ($1,$2,$3,$4)
            RETURNING notification_id
            """,
            alert_id,
            title,
            message,
            severity,
        )
        return as_int(row["notification_id"])

    async def get_many(self, user_id: int | None, limit: int) -> list[NotificationRecord]:
        """Return recent notifications; user_id is reserved for future per-user reads."""
        _ = user_id
        rows = await self.conn.fetch(
            """
            SELECT notification_id, alert_id, created_at, title, message, severity, is_read
            FROM notification_events
            ORDER BY created_at DESC
            LIMIT $1
            """,
            max(1, min(int(limit), 5000)),
        )
        return [self._to_record(row) for row in rows]

    async def mark_read(self, notification_ids: list[int]) -> None:
        """Mark selected notifications read, or all notifications when list is empty."""
        if notification_ids:
            await self.conn.execute("UPDATE notification_events SET is_read = TRUE WHERE notification_id = ANY($1::INT[])", notification_ids)
        else:
            await self.conn.execute("UPDATE notification_events SET is_read = TRUE")

    async def get_unread_count(self) -> int:
        """Return the number of unread notifications."""
        row = await self.conn.fetchrow("SELECT COUNT(*)::INT AS count FROM notification_events WHERE is_read = FALSE")
        return as_int(row["count"] if row else 0)
