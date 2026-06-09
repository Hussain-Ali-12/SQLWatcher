from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import FeedbackRecord
from app.repos._mapping import as_bool, as_int, value


class FeedbackRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> FeedbackRecord:
        return FeedbackRecord(
            feedback_id=as_int(row["feedback_id"]),
            query_id=value(row, "query_id"),
            anomaly_id=value(row, "anomaly_id"),
            analyst_name=value(row, "analyst_name"),
            feedback_type=value(row, "feedback_type"),
            notes=value(row, "notes"),
            applied=as_bool(value(row, "applied")),
            metadata_json=value(row, "metadata_json"),
            created_at=value(row, "created_at"),
        )

    async def insert(self, query_id: int, analyst_name: str, feedback_type: str, notes: str | None) -> None:
        """Insert analyst feedback for a query."""
        await self.conn.execute(
            """
            INSERT INTO analyst_feedback (query_id, analyst_name, feedback_type, notes)
            VALUES ($1,$2,$3,$4)
            """,
            query_id,
            analyst_name,
            feedback_type,
            notes or "",
        )

    async def get_by_query_id(self, query_id: int) -> list[FeedbackRecord]:
        """Return feedback records for a query, newest first."""
        rows = await self.conn.fetch(
            """
            SELECT feedback_id, query_id, anomaly_id, analyst_name, feedback_type,
                   notes, applied, metadata_json, created_at
            FROM analyst_feedback
            WHERE query_id = $1
            ORDER BY created_at DESC
            """,
            query_id,
        )
        return [self._to_record(row) for row in rows]
    async def get_many(self, query_id: int | None = None, limit: int = 50, offset: int = 0) -> list[FeedbackRecord]:
        """Return recent feedback records, optionally filtered by query_id."""
        args: list[Any] = [max(1, min(int(limit), 500)), max(0, int(offset))]
        where = ""
        if query_id is not None:
            args.append(int(query_id))
            where = f"WHERE query_id = ${len(args)}"
        rows = await self.conn.fetch(
            f"""
            SELECT feedback_id, query_id, anomaly_id, analyst_name, feedback_type,
                   notes, applied, metadata_json, created_at
            FROM analyst_feedback
            {where}
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            """,
            *args,
        )
        return [self._to_record(row) for row in rows]

    async def count(self, query_id: int | None = None) -> int:
        """Return the number of analyst-feedback records."""
        if query_id is None:
            row = await self.conn.fetchrow("SELECT COUNT(*)::INT AS count FROM analyst_feedback")
        else:
            row = await self.conn.fetchrow("SELECT COUNT(*)::INT AS count FROM analyst_feedback WHERE query_id = $1", int(query_id))
        return as_int(row["count"] if row else 0)

