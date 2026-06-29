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
    status: str = "active"
    created_at: datetime


class MessageOut(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    author_name: str
    content: str
    kind: str = "chat"
    created_at: datetime


class SuggestionOut(BaseModel):
    id: uuid.UUID
    title: str
    rationale: str
    metadata: dict = {}
    vote_count: int = 0
    backer_ids: list[uuid.UUID] = []


class SuggestionSetOut(BaseModel):
    id: uuid.UUID
    generation_number: int
    status: str
    suggestions: list[SuggestionOut] = []


class MissionResourceOut(BaseModel):
    id: uuid.UUID
    title: str
    url: str
    note: str | None = None


class MissionOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    status: str
    assigned_member_id: uuid.UUID | None = None
    assignee_name: str | None = None
    resources: list[MissionResourceOut] = []


class RoomState(BaseModel):
    id: uuid.UUID
    topic: str
    invite_code: str
    status: str
    generation_count: int
    generations_left: int
    template: TemplateOut
    members: list[MemberOut]
    messages: list[MessageOut]
    current_set: SuggestionSetOut | None = None
    decided_suggestion_id: uuid.UUID | None = None
    missions: list[MissionOut] = []
    closed_at: datetime | None = None
    requires_approval: bool = False
    pending_members: list[MemberOut] = []
    extra_chips: list[SeedChip] = []
    content_language: str = "en"
    welcome_blurb: str = ""
    conversation_starters: list[str] = []
    me: MemberOut | None = None
    # Populated only on create/join so the client can store it and send it back as a header
    # (cross-site auth where third-party cookies are blocked).
    session_token: str | None = None


class RoomPreview(BaseModel):
    id: uuid.UUID
    topic: str
    status: str
    member_count: int
    members: list[str]
    already_member: bool
    welcome_blurb: str = ""


class CreateRoomIn(BaseModel):
    template_id: uuid.UUID
    topic: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=60)
    language: str = "en"


class CreateCustomRoomIn(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=60)
    language: str = "en"


class JoinRoomIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)


class ApprovalIn(BaseModel):
    requires_approval: bool


class AddChipIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    options: list[str] = []


class AddMissionIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)


class CreateMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    kind: str = "chat"


class GenerateIn(BaseModel):
    refinement: str | None = Field(default=None, max_length=500)


class GenerateAccepted(BaseModel):
    set_id: uuid.UUID
    generation_number: int
    generations_left: int


class VoteResult(BaseModel):
    set_id: uuid.UUID
    tallies: dict[str, int] = {}
    backers: dict[str, list[uuid.UUID]] = {}


class DecideIn(BaseModel):
    suggestion_id: uuid.UUID


class DecisionLocked(BaseModel):
    decided_suggestion_id: uuid.UUID
    suggestion: SuggestionOut
