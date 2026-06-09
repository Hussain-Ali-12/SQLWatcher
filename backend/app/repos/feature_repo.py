from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import QueryFeaturesRecord
from app.repos._mapping import as_bool, as_int, value


class FeatureRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> QueryFeaturesRecord:
        return QueryFeaturesRecord(
            feature_id=as_int(row["feature_id"]),
            query_id=value(row, "query_id"),
            db_user=value(row, "db_user"),
            query_type=value(row, "query_type"),
            table_names=value(row, "table_names"),
            table_count=as_int(value(row, "table_count")),
            sensitive_table_count=as_int(value(row, "sensitive_table_count")),
            has_select_star=as_bool(value(row, "has_select_star")),
            has_limit=as_bool(value(row, "has_limit")),
            where_condition_count=as_int(value(row, "where_condition_count")),
            hour_of_day=value(row, "hour_of_day"),
            keyword_count=as_int(value(row, "keyword_count")),
            created_at=value(row, "created_at"),
        )

    async def insert(self, query_id: int, features: dict[str, Any]) -> None:
        """Insert extracted query features for a query log."""
        await self.conn.execute(
            """
            INSERT INTO query_features
              (query_id, db_user, query_type, table_names, table_count, sensitive_table_count,
               has_select_star, has_limit, where_condition_count, hour_of_day, keyword_count)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            """,
            query_id,
            features.get("db_user"),
            features.get("query_type"),
            features.get("table_names") or features.get("tables") or [],
            int(features.get("table_count") or 0),
            int(features.get("sensitive_table_count") or 0),
            bool(features.get("has_select_star") or False),
            bool(features.get("has_limit") or False),
            int(features.get("where_condition_count") or features.get("where_conditions") or 0),
            features.get("hour_of_day"),
            int(features.get("keyword_count") or 0),
        )

    async def get_by_query_id(self, query_id: int) -> QueryFeaturesRecord | None:
        """Return the newest feature vector for a query."""
        row = await self.conn.fetchrow(
            """
            SELECT *
            FROM query_features
            WHERE query_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            query_id,
        )
        return self._to_record(row) if row else None
