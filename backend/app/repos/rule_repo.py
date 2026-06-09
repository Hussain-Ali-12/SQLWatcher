from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import asyncpg

from app.models.records import RuleCreatePayload, RuleRecord, RuleTriggerHistoryRecord, RuleUpdatePayload
from app.repos._mapping import as_bool, as_int, value


class RuleRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _to_record(row: Mapping[str, Any]) -> RuleRecord:
        return RuleRecord(
            rule_id=as_int(row["rule_id"]),
            rule_name=str(row["rule_name"]),
            description=value(row, "description"),
            severity=str(value(row, "severity", "MEDIUM")),
            action=str(value(row, "action", "FLAG")),
            enabled=as_bool(value(row, "enabled"), True),
            trigger_count=as_int(value(row, "trigger_count")),
            created_at=value(row, "created_at"),
            updated_at=value(row, "updated_at"),
            rule_type=str(value(row, "rule_type", "BUILTIN")),
            match_pattern=value(row, "match_pattern"),
            match_target=str(value(row, "match_target", "RAW_SQL")),
            risk_score=as_int(value(row, "risk_score"), 50),
            is_system=as_bool(value(row, "is_system"), True),
        )

    @staticmethod
    def _select_sql(where_clause: str = "") -> str:
        return f"""
            SELECT rule_id, rule_name, description, severity, action, enabled, trigger_count, created_at,
                   COALESCE(updated_at, created_at) AS updated_at,
                   COALESCE(rule_type, 'BUILTIN') AS rule_type,
                   match_pattern,
                   COALESCE(match_target, 'RAW_SQL') AS match_target,
                   COALESCE(risk_score, 50) AS risk_score,
                   COALESCE(is_system, TRUE) AS is_system
            FROM rules
            {where_clause}
            ORDER BY
              COALESCE(is_system, TRUE) DESC,
              CASE severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 ELSE 0 END DESC,
              rule_name ASC
        """

    async def get_all(self) -> list[RuleRecord]:
        """Return all system and custom rules."""
        rows = await self.conn.fetch(self._select_sql())
        return [self._to_record(row) for row in rows]

    async def get_enabled(self) -> list[RuleRecord]:
        """Return all enabled rules."""
        rows = await self.conn.fetch(self._select_sql("WHERE enabled = TRUE"))
        return [self._to_record(row) for row in rows]

    async def get_by_name(self, name: str) -> RuleRecord | None:
        """Return one rule by normalized name."""
        row = await self.conn.fetchrow(self._select_sql("WHERE rule_name = $1"), name)
        return self._to_record(row) if row else None

    async def get_by_id(self, rule_id: int) -> RuleRecord | None:
        """Return one rule by ID."""
        row = await self.conn.fetchrow(self._select_sql("WHERE rule_id = $1"), rule_id)
        return self._to_record(row) if row else None

    async def insert(self, payload: RuleCreatePayload) -> RuleRecord:
        """Create a rule and return the inserted record."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO rules
              (rule_name, description, severity, action, enabled, rule_type,
               match_pattern, match_target, risk_score, is_system, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
            RETURNING rule_id, rule_name, description, severity, action, enabled, trigger_count,
                      created_at, updated_at, rule_type, match_pattern, match_target, risk_score, is_system
            """,
            payload.rule_name,
            payload.description,
            payload.severity,
            payload.action,
            payload.enabled,
            payload.rule_type,
            payload.match_pattern,
            payload.match_target,
            payload.risk_score,
            payload.is_system,
        )
        return self._to_record(row)

    async def update(self, rule_id: int, payload: RuleUpdatePayload) -> RuleRecord | None:
        """Update a rule and return the updated record, or None if missing."""
        existing = await self.conn.fetchrow("SELECT * FROM rules WHERE rule_id = $1", rule_id)
        if existing is None:
            return None
        row = await self.conn.fetchrow(
            """
            UPDATE rules
            SET rule_name = COALESCE($2, rule_name),
                description = COALESCE($3, description),
                severity = COALESCE($4, severity),
                action = COALESCE($5, action),
                enabled = COALESCE($6, enabled),
                rule_type = COALESCE($7, rule_type),
                match_pattern = COALESCE($8, match_pattern),
                match_target = COALESCE($9, match_target),
                risk_score = COALESCE($10, risk_score),
                is_system = COALESCE($11, is_system),
                updated_at = NOW()
            WHERE rule_id = $1
            RETURNING rule_id, rule_name, description, severity, action, enabled, trigger_count,
                      created_at, updated_at, rule_type, match_pattern, match_target, risk_score, is_system
            """,
            rule_id,
            payload.rule_name,
            payload.description,
            payload.severity,
            payload.action,
            payload.enabled,
            payload.rule_type,
            payload.match_pattern,
            payload.match_target,
            payload.risk_score,
            payload.is_system,
        )
        return self._to_record(row) if row else None

    async def delete(self, rule_id: int) -> bool:
        """Delete a non-system rule and return whether a row was removed."""
        result = await self.conn.execute("DELETE FROM rules WHERE rule_id = $1", rule_id)
        return result.endswith(" 1")

    async def toggle_enabled(self, rule_id: int) -> bool:
        """Toggle a rule enabled flag and return the new enabled state."""
        row = await self.conn.fetchrow(
            """
            UPDATE rules
            SET enabled = NOT enabled, updated_at = NOW()
            WHERE rule_id = $1
            RETURNING enabled
            """,
            rule_id,
        )
        if row is None:
            raise ValueError(f"Rule {rule_id} not found")
        return bool(row["enabled"])

    async def increment_trigger(self, rule_name: str) -> None:
        """Increment a rule's total trigger count."""
        await self.conn.execute("UPDATE rules SET trigger_count = trigger_count + 1, updated_at = NOW() WHERE rule_name = $1", rule_name)

    async def increment_trigger_history(self, rule_name: str) -> None:
        """Upsert today's rule trigger-history count."""
        await self.conn.execute(
            """
            INSERT INTO rule_trigger_history (rule_name, trigger_date, trigger_count)
            VALUES ($1, CURRENT_DATE, 1)
            ON CONFLICT (rule_name, trigger_date)
            DO UPDATE SET trigger_count = rule_trigger_history.trigger_count + 1
            """,
            rule_name,
        )

    async def get_trigger_history(self, rule_name: str, days: int = 7) -> list[RuleTriggerHistoryRecord]:
        """Return per-day trigger counts for a rule."""
        rows = await self.conn.fetch(
            """
            SELECT history_id, rule_name, trigger_date, trigger_count
            FROM rule_trigger_history
            WHERE rule_name = $1
              AND trigger_date >= CURRENT_DATE - (($2::INT - 1) * INTERVAL '1 day')
            ORDER BY trigger_date ASC
            """,
            rule_name,
            max(1, days),
        )
        return [
            RuleTriggerHistoryRecord(
                history_id=value(row, "history_id"),
                rule_name=str(row["rule_name"]),
                trigger_date=row["trigger_date"],
                trigger_count=as_int(row["trigger_count"]),
            )
            for row in rows
        ]

    async def reset_trigger_counts(self) -> None:
        """Reset all rule trigger counters to zero."""
        await self.conn.execute("UPDATE rules SET trigger_count = 0, updated_at = NOW()")

    @staticmethod
    def _seed_statements(seed_sql: str) -> list[str]:
        """Return executable SQL statements from a trusted seed file.

        Blank lines and comment-only lines are ignored before splitting on
        semicolons so the database driver receives one statement at a time.
        """
        cleaned_lines = [
            line
            for line in seed_sql.splitlines()
            if line.strip() and not line.lstrip().startswith("--")
        ]
        cleaned_sql = "\n".join(cleaned_lines)
        return [statement.strip() for statement in cleaned_sql.split(";") if statement.strip()]

    async def reset_system_rules(self, seed_sql: str) -> list[RuleRecord]:
        """Reset built-in rules from seed SQL and return all rules."""
        for statement in self._seed_statements(seed_sql):
            await self.conn.execute(statement)
        await self.conn.execute("UPDATE rules SET enabled = TRUE, trigger_count = 0, updated_at = NOW() WHERE COALESCE(is_system, TRUE) = TRUE")
        return await self.get_all()
