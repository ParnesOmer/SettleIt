"""room welcome_blurb — short AI-written context shown on the join screen

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-28
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rooms",
        sa.Column("welcome_blurb", sa.Text(), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("rooms", "welcome_blurb")
