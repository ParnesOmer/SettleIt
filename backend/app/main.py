"""FastAPI application: CORS, health, and the room WebSocket endpoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .api.routes_health import router as health_router
from .api.routes_rooms import router as rooms_router
from .api.routes_suggestions import router as suggestions_router
from .api.routes_templates import router as templates_router
from .config import get_settings
from .database import engine
from .realtime import broadcaster

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="SettleIt API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(templates_router, prefix="/api")
app.include_router(rooms_router, prefix="/api")
app.include_router(suggestions_router, prefix="/api")


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": "SettleIt API", "status": "ok", "docs": "/docs"}


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Lightweight liveness probe (no DB) for the platform health check."""
    return {"status": "ok"}


@app.websocket("/ws/rooms/{room_id}")
async def room_socket(websocket: WebSocket, room_id: str) -> None:
    """Members subscribe here; feature events are pushed server-side via the broadcaster.

    Inbound frames are only used as a keepalive for now — the client doesn't drive state over the
    socket, it posts to REST and receives the resulting broadcast.
    """
    await broadcaster.connect(room_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await broadcaster.disconnect(room_id, websocket)
