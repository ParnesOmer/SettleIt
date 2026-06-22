"""room content_language (for AI output)

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-22
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rooms",
        sa.Column("content_language", sa.String(length=8), server_default="en", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("rooms", "content_language")
