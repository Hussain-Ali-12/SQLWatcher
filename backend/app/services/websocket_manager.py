from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
import json

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.models.records import UserRecord


@dataclass
class ConnectedClient:
    websocket: WebSocket
    user_id: int
    role: str
    connected_at: datetime


class WebSocketManager:
    def __init__(self) -> None:
        self._clients: dict[int, ConnectedClient] = {}

    @property
    def active_connections(self) -> list[WebSocket]:
        return [client.websocket for client in self._clients.values()]

    async def connect(self, websocket: WebSocket, user: UserRecord | dict[str, Any] | None = None) -> None:
        if websocket.application_state == WebSocketState.CONNECTING:
            await websocket.accept()
        if isinstance(user, UserRecord):
            user_id = user.user_id
            role = user.role
        elif isinstance(user, dict):
            user_id = int(user.get("user_id", 0) or 0)
            role = str(user.get("role", "viewer"))
        else:
            user_id = 0
            role = "viewer"
        self._clients[id(websocket)] = ConnectedClient(
            websocket=websocket,
            user_id=user_id,
            role=role,
            connected_at=datetime.now(timezone.utc),
        )

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.pop(id(websocket), None)

    async def broadcast_all(self, message: dict[str, Any]) -> None:
        await self._broadcast(message, set(self._clients.keys()))

    async def broadcast_json(self, message: dict[str, Any]) -> None:
        await self.broadcast_all(message)

    async def broadcast_to_roles(self, roles: set[str], message: dict[str, Any]) -> None:
        ids = {key for key, client in self._clients.items() if client.role in roles}
        await self._broadcast(message, ids)

    async def broadcast_alert(self, alert_id: int, query_id: int, severity: str, sql: str, explanation: str) -> None:
        await self.broadcast_all(
            {
                "event": "new_alert",
                "type": "new_alert",
                "alert_id": alert_id,
                "query_id": query_id,
                "severity": severity,
                "sql": sql,
                "explanation": explanation,
            }
        )

    async def _broadcast(self, message: dict[str, Any], client_ids: set[int]) -> None:
        disconnected: list[WebSocket] = []
        for client_id in list(client_ids):
            client = self._clients.get(client_id)
            if client is None:
                continue
            try:
                await client.websocket.send_text(json.dumps(message, default=str))
            except Exception:
                disconnected.append(client.websocket)
        for websocket in disconnected:
            self.disconnect(websocket)

    def connection_count(self) -> int:
        return len(self._clients)


manager = WebSocketManager()
