"""Add optional SVG image columns to item table.

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("item", sa.Column("image_svg", sa.Text(), nullable=True))
    op.add_column("item", sa.Column("image_alt", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("item", "image_alt")
    op.drop_column("item", "image_svg")
