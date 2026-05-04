"""Add index on answer(child_id, answered_at) for daily activity queries.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    existing = {
        r[1] for r in conn.execute(sa.text("PRAGMA index_list('answer')")).fetchall()
    }
    if "ix_answer_child_answered" not in existing:
        op.create_index(
            "ix_answer_child_answered",
            "answer",
            ["child_id", "answered_at"],
        )


def downgrade() -> None:
    op.drop_index("ix_answer_child_answered", table_name="answer")
