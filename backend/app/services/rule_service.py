from __future__ import annotations

from app.models.records import RuleCreatePayload, RuleRecord, RuleTriggerHistoryRecord, RuleUpdatePayload
from app.repos.rule_repo import RuleRepo
from app.services.detection_service import rule_cache


class RuleService:
    def __init__(self, rule_repo: RuleRepo) -> None:
        self.rule_repo = rule_repo

    async def get_all(self) -> list[RuleRecord]:
        return await self.rule_repo.get_all()

    async def create(self, payload: RuleCreatePayload) -> RuleRecord:
        record = await self.rule_repo.insert(payload)
        rule_cache.mark_dirty()
        return record

    async def update(self, rule_id: int, payload: RuleUpdatePayload) -> RuleRecord | None:
        record = await self.rule_repo.update(rule_id, payload)
        rule_cache.mark_dirty()
        return record

    async def delete(self, rule_id: int) -> bool:
        deleted = await self.rule_repo.delete(rule_id)
        if deleted:
            rule_cache.mark_dirty()
        return deleted

    async def toggle(self, rule_id: int) -> bool:
        enabled = await self.rule_repo.toggle_enabled(rule_id)
        rule_cache.mark_dirty()
        return enabled

    async def increment_triggers(self, detection_method: str) -> None:
        if not detection_method or detection_method == "NONE":
            return
        for method in [item.strip() for item in detection_method.split(",") if item.strip()]:
            await self.rule_repo.increment_trigger(method)
            await self.rule_repo.increment_trigger_history(method)

    async def get_trigger_history(self, rule_name: str, days: int = 7) -> list[RuleTriggerHistoryRecord]:
        return await self.rule_repo.get_trigger_history(rule_name, days=days)

    def mark_cache_dirty(self) -> None:
        rule_cache.mark_dirty()
