"""Realtime broadcast layer.

Feature code only ever talks to the ``Broadcaster`` interface, so the in-memory implementation can
be swapped for a Redis pub/sub backend later without touching any routes. Single backend instance
for now: one process owns the ``room_id -> set[WebSocket]`` registry.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Any, Literal

from fastapi import WebSocket

EventType = Literal[
    "member_joined",
    "message_created",
    "generation_started",
    "suggestions_ready",
    "vote_updated",
    "decision_locked",
    "missions_ready",
    "mission_updated",
    "template_ready",
    "room_closed",
    "room_deleted",
    "member_removed",
    "member_pending",
    "member_approved",
    "chips_updated",
]


def make_event(event_type: EventType, payload: dict[str, Any]) -> dict[str, Any]:
    return {"type": event_type, "payload": payload}


class Broadcaster(ABC):
    """Transport-agnostic room broadcast interface."""

    @abstractmethod
    async def connect(self, room_id: str, websocket: WebSocket) -> None: ...

    @abstractmethod
    async def disconnect(self, room_id: str, websocket: WebSocket) -> None: ...

    @abstractmethod
    async def broadcast(self, room_id: str, event: dict[str, Any]) -> None: ...


class InMemoryBroadcaster(Broadcaster):
    """Single-instance registry of live sockets per room."""

    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._rooms[room_id].add(websocket)

    async def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._rooms[room_id].discard(websocket)
            if not self._rooms[room_id]:
                self._rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, event: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._rooms.get(room_id, ()))
        dead: list[WebSocket] = []
        for websocket in targets:
            try:
                await websocket.send_json(event)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            await self.disconnect(room_id, websocket)


# Process-wide singleton. Swap for a RedisBroadcaster here when scaling past one instance.
broadcaster: Broadcaster = InMemoryBroadcaster()
