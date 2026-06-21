"""SQLAlchemy 2.0 ORM models — the full SettleIt schema.

UUID primary keys, timezone-aware ``created_at`` everywhere, indexes on all foreign keys.
Status fields are stored as VARCHAR with a CHECK constraint (``native_enum=False``) so adding a
value later is a code change, not a Postgres enum migration.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class RoomStatus(str, enum.Enum):
    deciding = "deciding"
    decided = "decided"
    executing = "executing"


class MemberRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class SetStatus(str, enum.Enum):
    pending = "pending"
    complete = "complete"
    failed = "failed"


class MissionStatus(str, enum.Enum):
    open = "open"
    claimed = "claimed"
    done = "done"


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Template(Base):
    """A topic spec: seed chips, generation prompt, card shape, and execution spec."""

    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = _uuid_pk()
    topic_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    seed_chips: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    card_shape: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    execution_spec: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = _created_at()

    rooms: Mapped[list[Room]] = relationship(back_populates="template")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = _uuid_pk()
    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("templates.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    topic: Mapped[str] = mapped_column(String(200), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, index=True)
    status: Mapped[RoomStatus] = mapped_column(
        Enum(RoomStatus, native_enum=False, length=20, name="room_status"),
        nullable=False,
        server_default=text(f"'{RoomStatus.deciding.value}'"),
    )
    # Set when a decision locks. Circular FK to suggestions, added via ALTER (use_alter).
    decided_suggestion_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("suggestions.id", ondelete="SET NULL", use_alter=True, name="fk_rooms_decided_suggestion"),
        nullable=True,
    )
    generation_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = _created_at()

    template: Mapped[Template] = relationship(back_populates="rooms")
    members: Mapped[list[Member]] = relationship(
        back_populates="room", cascade="all, delete-orphan", foreign_keys="Member.room_id"
    )
    messages: Mapped[list[Message]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )
    suggestion_sets: Mapped[list[SuggestionSet]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )
    missions: Mapped[list[Mission]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class Member(Base):
    __tablename__ = "members"

    id: Mapped[uuid.UUID] = _uuid_pk()
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    display_name: Mapped[str] = mapped_column(String(60), nullable=False)
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole, native_enum=False, length=20, name="member_role"),
        nullable=False,
        server_default=text(f"'{MemberRole.member.value}'"),
    )
    session_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = _created_at()

    room: Mapped[Room] = relationship(back_populates="members", foreign_keys=[room_id])


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = _uuid_pk()
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    room: Mapped[Room] = relationship(back_populates="messages")
    member: Mapped[Member] = relationship()


class SuggestionSet(Base):
    """One row per Generate press (capped at 3 per room)."""

    __tablename__ = "suggestion_sets"

    id: Mapped[uuid.UUID] = _uuid_pk()
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    generation_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[SetStatus] = mapped_column(
        Enum(SetStatus, native_enum=False, length=20, name="set_status"),
        nullable=False,
        server_default=text(f"'{SetStatus.pending.value}'"),
    )
    created_at: Mapped[datetime] = _created_at()

    room: Mapped[Room] = relationship(back_populates="suggestion_sets")
    suggestions: Mapped[list[Suggestion]] = relationship(
        back_populates="set", cascade="all, delete-orphan"
    )


class Suggestion(Base):
    __tablename__ = "suggestions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    set_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("suggestion_sets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    # "metadata" is reserved on the declarative base, so the attribute is "meta".
    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = _created_at()

    set: Mapped[SuggestionSet] = relationship(back_populates="suggestions")
    votes: Mapped[list[Vote]] = relationship(
        back_populates="suggestion", cascade="all, delete-orphan"
    )


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (
        UniqueConstraint("suggestion_id", "member_id", name="uq_vote_member_suggestion"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    suggestion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("suggestions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_at: Mapped[datetime] = _created_at()

    suggestion: Mapped[Suggestion] = relationship(back_populates="votes")
    member: Mapped[Member] = relationship()


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[MissionStatus] = mapped_column(
        Enum(MissionStatus, native_enum=False, length=20, name="mission_status"),
        nullable=False,
        server_default=text(f"'{MissionStatus.open.value}'"),
    )
    created_at: Mapped[datetime] = _created_at()

    room: Mapped[Room] = relationship(back_populates="missions")
    assigned_member: Mapped[Member | None] = relationship()
    resources: Mapped[list[MissionResource]] = relationship(
        back_populates="mission", cascade="all, delete-orphan"
    )


class MissionResource(Base):
    """A grounded starter-box link — only ever populated from real search results."""

    __tablename__ = "mission_resources"

    id: Mapped[uuid.UUID] = _uuid_pk()
    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _created_at()

    mission: Mapped[Mission] = relationship(back_populates="resources")
