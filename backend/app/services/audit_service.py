from __future__ import annotations

from typing import Any

from app.core.database import get_control_pool
from app.repos.audit_repo import AuditRepo


class AuditService:
    def __init__(self, audit_repo: AuditRepo) -> None:
        self.audit_repo = audit_repo

    async def log(
        self,
        event_type: str,
        description: str,
        actor: dict[str, Any] | None = None,
        entity_type: str | None = None,
        entity_id: str | int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        await self.audit_repo.insert(
            event_type=event_type,
            description=description,
            actor_id=int(actor["user_id"]) if actor and actor.get("user_id") is not None else None,
            actor_email=str(actor.get("username") or actor.get("email")) if actor else None,
            actor_role=str(actor.get("role")) if actor and actor.get("role") is not None else None,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata=metadata or {},
        )


async def log_audit_event(
    event_type: str,
    description: str,
    actor: dict[str, Any] | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        await AuditService(AuditRepo(conn)).log(event_type, description, actor, entity_type, entity_id, metadata)
