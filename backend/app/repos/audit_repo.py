from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
import json

import asyncpg

from app.models.records import AuditEventRecord
from app.repos._mapping import as_int, value

def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if is_dataclass(value):
        return _json_safe(asdict(value))
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


class AuditRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> AuditEventRecord:
        return AuditEventRecord(
            event_id=as_int(row["event_id"]),
            timestamp=value(row, "timestamp"),
            actor_email=value(row, "actor_email"),
            actor_role=value(row, "actor_role"),
            event_type=str(row["event_type"]),
            entity_type=value(row, "entity_type"),
            entity_id=value(row, "entity_id"),
            description=value(row, "description"),
            metadata_json=value(row, "metadata_json"),
        )

    async def insert(
        self,
        event_type: str,
        description: str | None,
        actor_id: int | None,
        actor_email: str | None,
        actor_role: str | None,
        entity_type: str | None,
        entity_id: int | str | None,
        metadata: Any,
    ) -> None:
        """Insert an audit event."""
        _ = actor_id
        await self.conn.execute(
            """
            INSERT INTO audit_events
              (event_type, description, actor_email, actor_role, entity_type, entity_id, metadata_json)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            """,
            event_type,
            description,
            actor_email,
            actor_role,
            entity_type,
            str(entity_id) if entity_id is not None else None,
            metadata if isinstance(metadata, str) or metadata is None else json.dumps(_json_safe(metadata)),
        )

    async def get_many(self, event_type_filter: str | None, limit: int, offset: int = 0) -> list[AuditEventRecord]:
        """Return audit events with optional event-type filtering."""
        args: list[Any] = [max(1, min(int(limit), 5000)), max(0, int(offset))]
        where = ""
        if event_type_filter:
            args.append(event_type_filter.upper())
            where = f"WHERE event_type = ${len(args)}"
        rows = await self.conn.fetch(
            f"""
            SELECT event_id, timestamp, actor_email, actor_role, event_type,
                   entity_type, entity_id, description, metadata_json
            FROM audit_events
            {where}
            ORDER BY timestamp DESC
            LIMIT $1 OFFSET $2
            """,
            *args,
        )
        return [self._to_record(row) for row in rows]
