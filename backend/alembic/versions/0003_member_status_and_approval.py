"""member status + room requires_approval

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-22
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column(
            "status",
            sa.Enum("active", "pending", "removed", name="member_status", native_enum=False, length=20),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
    )
    op.add_column(
        "rooms",
        sa.Column("requires_approval", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("rooms", "requires_approval")
    op.drop_column("members", "status")
