from __future__ import annotations

from collections.abc import Mapping
from typing import Any
import json

import asyncpg

from app.models.records import BaselineProfileRecord
from app.repos._mapping import as_bool, as_float, as_int, value


class BaselineRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> BaselineProfileRecord:
        blob = value(row, "ml_model")
        return BaselineProfileRecord(
            profile_id=value(row, "profile_id"),
            db_user=value(row, "db_user"),
            sample_count=as_int(value(row, "sample_count")),
            query_type_distribution=value(row, "query_type_distribution", {}) or {},
            common_tables=value(row, "common_tables", []) or [],
            avg_table_count=as_float(value(row, "avg_table_count")),
            avg_where_conditions=as_float(value(row, "avg_where_conditions")),
            avg_has_limit=as_float(value(row, "avg_has_limit")),
            avg_has_select_star=as_float(value(row, "avg_has_select_star")),
            avg_sensitive_table_count=as_float(value(row, "avg_sensitive_table_count")),
            avg_risk_score=as_float(value(row, "avg_risk_score")),
            normal_hours=value(row, "normal_hours", []) or [],
            model_version=value(row, "model_version"),
            ml_enabled=as_bool(value(row, "ml_enabled")),
            ml_algorithm=value(row, "ml_algorithm"),
            ml_model=bytes(blob) if blob is not None else None,
            ml_feature_schema=value(row, "ml_feature_schema", {}) or {},
            ml_training_error=value(row, "ml_training_error"),
            updated_at=value(row, "updated_at"),
        )

    async def get_by_user(self, db_user: str) -> BaselineProfileRecord | None:
        """Return one baseline profile for a DB user."""
        row = await self.conn.fetchrow("SELECT * FROM baseline_profiles WHERE db_user = $1", db_user)
        return self._to_record(row) if row else None

    async def get_all(self) -> list[BaselineProfileRecord]:
        """Return all baseline profiles."""
        rows = await self.conn.fetch("SELECT * FROM baseline_profiles ORDER BY db_user ASC")
        return [self._to_record(row) for row in rows]

    async def upsert(self, profile: BaselineProfileRecord) -> None:
        """Insert or update a baseline profile."""
        await self.conn.execute(
            """
            INSERT INTO baseline_profiles
              (db_user, sample_count, query_type_distribution, common_tables, avg_table_count,
               avg_where_conditions, avg_has_limit, avg_has_select_star, avg_sensitive_table_count,
               avg_risk_score, normal_hours, model_version, ml_enabled, ml_algorithm, ml_model,
               ml_feature_schema, ml_training_error, updated_at)
            VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,NOW())
            ON CONFLICT (db_user) DO UPDATE
            SET sample_count = EXCLUDED.sample_count,
                query_type_distribution = EXCLUDED.query_type_distribution,
                common_tables = EXCLUDED.common_tables,
                avg_table_count = EXCLUDED.avg_table_count,
                avg_where_conditions = EXCLUDED.avg_where_conditions,
                avg_has_limit = EXCLUDED.avg_has_limit,
                avg_has_select_star = EXCLUDED.avg_has_select_star,
                avg_sensitive_table_count = EXCLUDED.avg_sensitive_table_count,
                avg_risk_score = EXCLUDED.avg_risk_score,
                normal_hours = EXCLUDED.normal_hours,
                model_version = EXCLUDED.model_version,
                ml_enabled = EXCLUDED.ml_enabled,
                ml_algorithm = EXCLUDED.ml_algorithm,
                ml_model = EXCLUDED.ml_model,
                ml_feature_schema = EXCLUDED.ml_feature_schema,
                ml_training_error = EXCLUDED.ml_training_error,
                updated_at = NOW()
            """,
            profile.db_user,
            profile.sample_count,
            json.dumps(dict(profile.query_type_distribution)),
            list(profile.common_tables),
            profile.avg_table_count,
            profile.avg_where_conditions,
            profile.avg_has_limit,
            profile.avg_has_select_star,
            profile.avg_sensitive_table_count,
            profile.avg_risk_score,
            list(profile.normal_hours),
            profile.model_version,
            profile.ml_enabled,
            profile.ml_algorithm,
            profile.ml_model,
            json.dumps(dict(profile.ml_feature_schema)),
            profile.ml_training_error,
        )
