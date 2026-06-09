from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.logging import get_logger
from app.services.auth_service import get_user_by_token
from app.services.websocket_manager import manager

logger = get_logger(__name__)
router = APIRouter(tags=["WebSocket"])


def _normalize_handshake_token(message: Any) -> str | None:
    """Extract a bearer/session token from the WebSocket auth handshake."""
    if not isinstance(message, dict):
        return None
    if message.get("type") != "auth":
        return None
    token = message.get("token")
    if not isinstance(token, str):
        return None
    token = token.strip()
    if token.lower().startswith("bearer "):
        token = token.split(" ", 1)[1].strip()
    return token or None


async def _alerts_socket(websocket: WebSocket) -> None:
    """Authenticate a WebSocket alert stream with a post-connect handshake."""
    await websocket.accept()

    try:
        auth_message = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        token = _normalize_handshake_token(auth_message)
        user = await get_user_by_token(token) if token else None
    except (asyncio.TimeoutError, WebSocketDisconnect, ValueError, TypeError) as exc:
        logger.warning(
            "websocket_auth_handshake_failed",
            path=str(websocket.url.path),
            client=str(websocket.client) if websocket.client else None,
            error=str(exc),
        )
        await websocket.close(code=4401)
        return

    if user is None:
        logger.warning(
            "websocket_auth_failed",
            path=str(websocket.url.path),
            client=str(websocket.client) if websocket.client else None,
        )
        await websocket.close(code=4401)
        return

    await manager.connect(websocket, user)
    await websocket.send_json({"type": "auth_ok"})
    logger.info(
        "websocket_connected",
        path=str(websocket.url.path),
        user_id=user.get("user_id"),
        role=user.get("role"),
        connections=manager.connection_count(),
    )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(
            "websocket_disconnected",
            user_id=user.get("user_id"),
            role=user.get("role"),
            connections=manager.connection_count(),
        )


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket) -> None:
    """Alert stream endpoint used by the local Vite frontend."""
    await _alerts_socket(websocket)


@router.websocket("/api/ws/alerts")
async def websocket_alerts_api(websocket: WebSocket) -> None:
    """Alert stream endpoint used when WS_BASE already includes the /api prefix."""
    await _alerts_socket(websocket)
