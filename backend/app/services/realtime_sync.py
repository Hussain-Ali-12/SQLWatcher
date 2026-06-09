from __future__ import annotations

import asyncio
import time
from typing import Any

from app.core.config import settings
from app.services.websocket_manager import manager


class RealtimeSync:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._last_sync_at = 0.0
        self._pending_count = 0
        self._pending_reasons: set[str] = set()

    async def request(self, reason: str, **metadata: Any) -> None:
        event_to_send: dict[str, Any] | None = None
        now = time.monotonic()
        async with self._lock:
            self._pending_count += 1
            self._pending_reasons.add(reason)
            should_send = (
                now - self._last_sync_at >= settings.realtime_sync_min_interval_seconds
                or self._pending_count >= settings.realtime_sync_batch_size
            )
            if should_send:
                event_to_send = {
                    "event": "sync_required",
                    "type": "sync_required",
                    "reason": ",".join(sorted(self._pending_reasons)),
                    "pending_count": self._pending_count,
                    "message": "Batched dashboard sync requested.",
                    **metadata,
                }
                self._last_sync_at = now
                self._pending_count = 0
                self._pending_reasons = set()
        if event_to_send:
            await manager.broadcast_all(event_to_send)

    async def force(self, reason: str, **metadata: Any) -> None:
        async with self._lock:
            pending_count = self._pending_count
            pending_reasons = ",".join(sorted(self._pending_reasons)) if self._pending_reasons else reason
            self._last_sync_at = time.monotonic()
            self._pending_count = 0
            self._pending_reasons = set()
        await manager.broadcast_all(
            {
                "event": "sync_required",
                "type": "sync_required",
                "reason": pending_reasons,
                "forced_reason": reason,
                "pending_count": pending_count,
                "message": "Immediate dashboard sync requested.",
                **metadata,
            }
        )


sync_service = RealtimeSync()


async def request_realtime_sync(reason: str, **metadata: Any) -> None:
    await sync_service.request(reason, **metadata)


async def force_realtime_sync(reason: str, **metadata: Any) -> None:
    await sync_service.force(reason, **metadata)
