from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any

import asyncpg

from app.models.records import SessionRecord, UserRecord
from app.repos._mapping import as_bool, as_int, value


class SessionRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> SessionRecord:
        user = None
        if "username" in row and value(row, "username") is not None:
            user = UserRecord(
                user_id=as_int(row["user_id"]),
                username=str(row["username"]),
                email=str(row["email"]),
                full_name=str(row["full_name"]),
                role=str(row["role"]),
                is_active=as_bool(value(row, "is_active"), True),
                password_hash=value(row, "password_hash"),
            )
        return SessionRecord(
            token_hash=str(row["token_hash"]),
            user_id=as_int(row["user_id"]),
            created_at=value(row, "created_at"),
            expires_at=row["expires_at"],
            revoked_at=value(row, "revoked_at"),
            user=user,
        )

    async def insert(self, token_hash: str, user_id: int, expires_at: datetime) -> None:
        """Create an auth session."""
        await self.conn.execute(
            """
            INSERT INTO auth_sessions (token_hash, user_id, expires_at)
            VALUES ($1,$2,$3)
            """,
            token_hash,
            user_id,
            expires_at,
        )

    async def get_active_by_token_hash(self, token_hash: str) -> SessionRecord | None:
        """Return an active non-expired session by token hash."""
        row = await self.conn.fetchrow(
            """
            SELECT s.token_hash, s.user_id, s.created_at, s.expires_at, s.revoked_at,
                   u.username, u.email, u.full_name, u.role, u.is_active
            FROM auth_sessions s
            JOIN app_users u ON u.user_id = s.user_id
            WHERE s.token_hash = $1
              AND s.revoked_at IS NULL
              AND s.expires_at > NOW()
              AND u.is_active = TRUE
            """,
            token_hash,
        )
        return self._to_record(row) if row else None

    async def revoke(self, token_hash: str) -> None:
        """Mark a session as revoked."""
        await self.conn.execute("UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1", token_hash)

    async def prune_expired(self) -> int:
        """Delete expired sessions and return the deleted count."""
        result = await self.conn.execute("DELETE FROM auth_sessions WHERE expires_at <= NOW() OR revoked_at IS NOT NULL")
        return int(result.split()[-1]) if result.split()[-1].isdigit() else 0
