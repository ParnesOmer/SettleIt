"""Pydantic API models — the typed contract shared with the frontend client."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str
    database: bool


class SeedChip(BaseModel):
    id: str
    label: str
    options: list[str] | None = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    topic_name: str
    is_custom: bool
    seed_chips: list[SeedChip] = []


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    role: str
    created_at: datetime


class MessageOut(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    author_name: str
    content: str
    created_at: datetime


class RoomState(BaseModel):
    id: uuid.UUID
    topic: str
    invite_code: str
    status: str
    generation_count: int
    template: TemplateOut
    members: list[MemberOut]
    messages: list[MessageOut]
    me: MemberOut | None = None


class RoomPreview(BaseModel):
    id: uuid.UUID
    topic: str
    status: str
    member_count: int
    members: list[str]
    already_member: bool


class CreateRoomIn(BaseModel):
    template_id: uuid.UUID
    topic: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=60)


class JoinRoomIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)


class CreateMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
