from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import LoginAttemptRecord
from app.repos._mapping import as_int, value


class LoginAttemptRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> LoginAttemptRecord:
        return LoginAttemptRecord(
            attempt_id=value(row, "attempt_id"),
            ip=str(row["ip"]),
            attempted_at=row["attempted_at"],
        )

    async def record(self, ip: str) -> None:
        """Record one login attempt for an IP address."""
        await self.conn.execute("INSERT INTO login_attempts (ip, attempted_at) VALUES ($1, NOW())", ip)

    async def count_recent(self, ip: str, window_minutes: int = 5) -> int:
        """Return recent attempt count for an IP inside the given window."""
        row = await self.conn.fetchrow(
            """
            SELECT COUNT(*)::INT AS attempt_count
            FROM login_attempts
            WHERE ip = $1
              AND attempted_at >= NOW() - ($2::INT * INTERVAL '1 minute')
            """,
            ip,
            window_minutes,
        )
        return as_int(row["attempt_count"] if row else 0)

    async def clear_by_ip(self, ip: str) -> None:
        """Delete login attempts for an IP after successful authentication."""
        await self.conn.execute("DELETE FROM login_attempts WHERE ip = $1", ip)

    async def prune_old(self, older_than_hours: int = 24) -> int:
        """Delete old login attempts and return the deleted count."""
        result = await self.conn.execute(
            """
            DELETE FROM login_attempts
            WHERE attempted_at < NOW() - ($1::INT * INTERVAL '1 hour')
            """,
            older_than_hours,
        )
        return int(result.split()[-1]) if result.split()[-1].isdigit() else 0
