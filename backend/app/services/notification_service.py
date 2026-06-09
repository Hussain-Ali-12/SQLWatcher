from __future__ import annotations

from app.core.database import get_control_pool
from app.repos.notification_repo import NotificationRepo


class NotificationService:
    def __init__(self, notification_repo: NotificationRepo) -> None:
        self.notification_repo = notification_repo

    async def create(self, alert_id: int, title: str, message: str | None, severity: str | None) -> int:
        return await self.notification_repo.insert(alert_id, title, message, severity)

    async def list(self, user_id: int | None = None, limit: int = 30) -> list[dict]:
        records = await self.notification_repo.get_many(user_id, limit)
        return [record.__dict__ for record in records]

    async def mark_read(self, notification_ids: list[int] | None = None) -> int:
        await self.notification_repo.mark_read(notification_ids or [])
        return len(notification_ids) if notification_ids else -1


async def create_notification(alert_id: int, title: str, message: str, severity: str) -> None:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        await NotificationService(NotificationRepo(conn)).create(alert_id, title, message, severity)


async def list_notifications(limit: int = 30):
    pool = get_control_pool()
    async with pool.acquire() as conn:
        return await NotificationService(NotificationRepo(conn)).list(limit=limit)


async def mark_notifications_read(notification_ids: list[int] | None = None) -> int:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        return await NotificationService(NotificationRepo(conn)).mark_read(notification_ids)
