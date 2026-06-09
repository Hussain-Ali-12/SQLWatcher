from __future__ import annotations

from typing import Any

import asyncpg


class ConfigRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    async def get_all(self) -> dict[str, dict[str, Any]]:
        """Return deployment/system config keyed by config_key."""
        rows = await self.conn.fetch("SELECT config_key, config_value, is_secret, updated_at FROM deployment_config ORDER BY config_key")
        return {
            row["config_key"]: {
                "value": row["config_value"],
                "is_secret": bool(row["is_secret"]),
                "updated_at": row["updated_at"],
            }
            for row in rows
        }

    async def upsert(self, key: str, value: str | None, is_secret: bool = False) -> None:
        """Insert or update one config key."""
        await self.conn.execute(
            """
            INSERT INTO deployment_config (config_key, config_value, is_secret, updated_at)
            VALUES ($1,$2,$3,NOW())
            ON CONFLICT (config_key) DO UPDATE
            SET config_value = EXCLUDED.config_value,
                is_secret = EXCLUDED.is_secret,
                updated_at = NOW()
            """,
            key,
            value,
            is_secret,
        )

    async def get_by_key(self, key: str) -> str | None:
        """Return one config value by key."""
        row = await self.conn.fetchrow("SELECT config_value FROM deployment_config WHERE config_key = $1", key)
        return row["config_value"] if row else None
