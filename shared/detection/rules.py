from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class BuiltinRule:
    name: str
    severity: str
    action: str
    risk_score: int
    description: str


@dataclass(frozen=True)
class RuleSet:
    enabled_names: set[str] | None = None
    custom_rules: list[dict[str, Any]] = field(default_factory=list)

    def is_enabled(self, rule_name: str) -> bool:
        return self.enabled_names is None or rule_name in self.enabled_names


class RuleCache:
    """Portable in-memory rule snapshot with no FastAPI/backend imports."""

    def __init__(self) -> None:
        self.enabled_names: set[str] | None = None
        self.custom_rules: list[dict[str, Any]] = []

    def set_rules(self, enabled_names: set[str] | None, custom_rules: list[dict[str, Any]]) -> None:
        self.enabled_names = enabled_names
        self.custom_rules = list(custom_rules)

    def snapshot(self) -> RuleSet:
        return RuleSet(
            enabled_names=set(self.enabled_names) if self.enabled_names is not None else None,
            custom_rules=list(self.custom_rules),
        )
