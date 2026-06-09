from __future__ import annotations

from typing import Any

from app.models.schemas import DetectionResult
from app.repos.rule_repo import RuleRepo
from shared.detection.engine import detect_query


class RuleCache:
    """In-memory snapshot of enabled rules. Refreshed on rule mutation."""

    def __init__(self) -> None:
        self._enabled_names: set[str] = set()
        self._custom_rules: list[dict[str, Any]] = []
        self._dirty = True

    async def refresh(self, rule_repo: RuleRepo) -> None:
        rules = await rule_repo.get_all()
        self._enabled_names = {rule.rule_name for rule in rules if rule.enabled}
        self._custom_rules = [
            {
                "rule_name": rule.rule_name,
                "enabled": rule.enabled,
                "rule_type": rule.rule_type,
                "match_pattern": rule.match_pattern,
                "match_target": rule.match_target,
                "risk_score": rule.risk_score,
                "severity": rule.severity,
                "action": rule.action,
                "description": rule.description,
                "is_system": rule.is_system,
            }
            for rule in rules
            if rule.enabled and not rule.is_system and rule.match_pattern
        ]
        self._dirty = False

    def mark_dirty(self) -> None:
        self._dirty = True

    @property
    def enabled_names(self) -> set[str]:
        return set(self._enabled_names)

    @property
    def custom_rules(self) -> list[dict[str, Any]]:
        return list(self._custom_rules)

    @property
    def dirty(self) -> bool:
        return self._dirty


rule_cache = RuleCache()


class DetectionService:
    def __init__(self, rule_repo: RuleRepo, cache: RuleCache = rule_cache) -> None:
        self.rule_repo = rule_repo
        self.cache = cache

    async def inspect(self, sql: str, db_user: str = "web_app", client_ip: str = "127.0.0.1", hour: int | None = None) -> DetectionResult:
        if self.cache.dirty:
            await self.cache.refresh(self.rule_repo)
        result = detect_query(sql, current_hour=hour, enabled_rules=self.cache.enabled_names, custom_rules=self.cache.custom_rules)
        return DetectionResult(
            action=result.action,
            severity=result.severity,
            risk_score=result.risk_score,
            detection_method=result.detection_method,
            explanation=result.explanation,
            query_type=result.query_type,
            normalized_sql=result.normalized_sql,
        )
