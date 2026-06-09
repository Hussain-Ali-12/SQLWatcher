from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends

from app.dependencies.auth import require_roles
from app.dependencies.db import Repos, get_repos

router = APIRouter(prefix="/api/audit", tags=["Audit Trail"])


@router.get("/events")
async def audit_events(
    limit: int = 100,
    offset: int = 0,
    type: str | None = None,
    current_user: dict = Depends(require_roles("admin", "analyst")),
    repos: Repos = Depends(get_repos),
):
    rows = await repos.audit.get_many(type, max(1, min(int(limit), 5000)), max(0, int(offset)))
    return [asdict(row) for row in rows]
