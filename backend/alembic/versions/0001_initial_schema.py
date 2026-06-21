"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _uuid() -> postgresql.UUID:
    return postgresql.UUID(as_uuid=True)


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "templates",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("topic_name", sa.String(length=120), nullable=False),
        sa.Column("is_custom", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("seed_chips", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("card_shape", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("execution_spec", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        _created_at(),
    )
    op.create_index("ix_templates_topic_name", "templates", ["topic_name"])

    op.create_table(
        "rooms",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("template_id", _uuid(), nullable=False),
        sa.Column("topic", sa.String(length=200), nullable=False),
        sa.Column("invite_code", sa.String(length=16), nullable=False),
        sa.Column(
            "status",
            sa.Enum("deciding", "decided", "executing", name="room_status", native_enum=False, length=20),
            server_default=sa.text("'deciding'"),
            nullable=False,
        ),
        sa.Column("decided_suggestion_id", _uuid(), nullable=True),
        sa.Column("generation_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["template_id"], ["templates.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_rooms_template_id", "rooms", ["template_id"])
    op.create_index("ix_rooms_invite_code", "rooms", ["invite_code"], unique=True)

    op.create_table(
        "members",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("room_id", _uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=60), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "member", name="member_role", native_enum=False, length=20),
            server_default=sa.text("'member'"),
            nullable=False,
        ),
        sa.Column("session_token", sa.String(length=64), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_members_room_id", "members", ["room_id"])
    op.create_index("ix_members_session_token", "members", ["session_token"], unique=True)

    op.create_table(
        "messages",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("room_id", _uuid(), nullable=False),
        sa.Column("member_id", _uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_messages_room_id", "messages", ["room_id"])
    op.create_index("ix_messages_member_id", "messages", ["member_id"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])

    op.create_table(
        "suggestion_sets",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("room_id", _uuid(), nullable=False),
        sa.Column("generation_number", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "complete", "failed", name="set_status", native_enum=False, length=20),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        _created_at(),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_suggestion_sets_room_id", "suggestion_sets", ["room_id"])

    op.create_table(
        "suggestions",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("set_id", _uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["set_id"], ["suggestion_sets.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_suggestions_set_id", "suggestions", ["set_id"])

    op.create_table(
        "votes",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("suggestion_id", _uuid(), nullable=False),
        sa.Column("member_id", _uuid(), nullable=False),
        sa.Column("value", sa.Integer(), server_default=sa.text("1"), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["suggestion_id"], ["suggestions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("suggestion_id", "member_id", name="uq_vote_member_suggestion"),
    )
    op.create_index("ix_votes_suggestion_id", "votes", ["suggestion_id"])
    op.create_index("ix_votes_member_id", "votes", ["member_id"])

    op.create_table(
        "missions",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("room_id", _uuid(), nullable=False),
        sa.Column("assigned_member_id", _uuid(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("open", "claimed", "done", name="mission_status", native_enum=False, length=20),
            server_default=sa.text("'open'"),
            nullable=False,
        ),
        _created_at(),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_member_id"], ["members.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_missions_room_id", "missions", ["room_id"])
    op.create_index("ix_missions_assigned_member_id", "missions", ["assigned_member_id"])

    op.create_table(
        "mission_resources",
        sa.Column("id", _uuid(), primary_key=True),
        sa.Column("mission_id", _uuid(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        _created_at(),
        sa.ForeignKeyConstraint(["mission_id"], ["missions.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_mission_resources_mission_id", "mission_resources", ["mission_id"])

    # Circular FK: a room points at its winning suggestion. Added after both tables exist.
    op.create_foreign_key(
        "fk_rooms_decided_suggestion",
        "rooms",
        "suggestions",
        ["decided_suggestion_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_rooms_decided_suggestion", "rooms", type_="foreignkey")
    op.drop_table("mission_resources")
    op.drop_table("missions")
    op.drop_table("votes")
    op.drop_table("suggestions")
    op.drop_table("suggestion_sets")
    op.drop_table("messages")
    op.drop_table("members")
    op.drop_table("rooms")
    op.drop_table("templates")
