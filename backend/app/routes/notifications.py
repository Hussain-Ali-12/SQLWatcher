from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.dependencies.db import Repos, get_repos
from app.models.schemas import NotificationReadRequest
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
async def notifications(limit: int = 30, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    rows = await NotificationService(repos.notification).list(user_id=int(current_user.get("user_id", 0) or 0), limit=max(1, min(int(limit), 200)))
    unread = sum(1 for row in rows if not row.get("is_read"))
    return {"unread_count": unread, "items": rows}


@router.post("/mark-read")
async def mark_read(payload: NotificationReadRequest, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    count = await NotificationService(repos.notification).mark_read(payload.notification_ids or None)
    await AuditService(repos.audit).log("NOTIFICATIONS_MARK_READ", "Notifications marked as read.", actor=current_user, entity_type="notification_events", metadata={"count": count, "notification_ids": payload.notification_ids})
    return {"status": "updated", "count": count}
