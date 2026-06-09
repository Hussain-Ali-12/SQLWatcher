from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import UserRecord
from app.repos._mapping import as_bool, as_int, value


class UserRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> UserRecord:
        return UserRecord(
            user_id=as_int(row["user_id"]),
            username=str(row["username"]),
            email=str(row["email"]),
            full_name=str(row["full_name"]),
            role=str(row["role"]),
            is_active=as_bool(value(row, "is_active"), True),
            password_hash=value(row, "password_hash"),
        )

    async def get_by_username(self, username: str) -> UserRecord | None:
        """Return one user by username, including password_hash for auth."""
        row = await self.conn.fetchrow(
            """
            SELECT user_id, username, email, full_name, role, is_active, password_hash
            FROM app_users
            WHERE username = $1
            """,
            username.lower().strip(),
        )
        return self._to_record(row) if row else None

    async def get_by_id(self, user_id: int) -> UserRecord | None:
        """Return one user by ID."""
        row = await self.conn.fetchrow(
            """
            SELECT user_id, username, email, full_name, role, is_active, password_hash
            FROM app_users
            WHERE user_id = $1
            """,
            user_id,
        )
        return self._to_record(row) if row else None

    async def upsert(self, username: str, email: str, full_name: str, role: str, password_hash: str) -> UserRecord:
        """Insert or update a user and return the stored user record."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO app_users (username, email, full_name, role, password_hash, is_active)
            VALUES ($1,$2,$3,$4,$5,TRUE)
            ON CONFLICT (username) DO UPDATE
            SET email = EXCLUDED.email,
                full_name = EXCLUDED.full_name,
                role = EXCLUDED.role,
                password_hash = EXCLUDED.password_hash,
                is_active = TRUE
            RETURNING user_id, username, email, full_name, role, is_active, password_hash
            """,
            username,
            email,
            full_name,
            role,
            password_hash,
        )
        return self._to_record(row)
