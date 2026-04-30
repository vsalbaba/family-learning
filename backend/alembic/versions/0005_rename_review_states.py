"""Rename review_state statuses: learning→review, new→learning.

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-30
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE review_state SET status = 'review' WHERE status = 'learning'")
    op.execute("UPDATE review_state SET status = 'learning' WHERE status = 'new'")


def downgrade() -> None:
    op.execute("UPDATE review_state SET status = 'new' WHERE status = 'learning'")
    op.execute("UPDATE review_state SET status = 'learning' WHERE status = 'review'")
