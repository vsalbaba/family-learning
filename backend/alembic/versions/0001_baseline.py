"""Baseline: stamp current schema state.

Revision ID: 0001
Revises: None
Create Date: 2026-04-17

This is a no-op migration that marks the existing database schema as
the Alembic baseline. All tables already exist via Base.metadata.create_all()
and the former _migrate_add_columns() manual migrations.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
