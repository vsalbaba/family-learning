"""Add package_ids JSON column to parental_review for multi-package support.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    existing_cols = {
        r[1] for r in conn.execute(sa.text("PRAGMA table_info('parental_review')")).fetchall()
    }
    if "package_ids" not in existing_cols:
        op.add_column(
            "parental_review",
            sa.Column("package_ids", sa.Text, nullable=True),
        )

    # Backfill: convert existing single package_id to JSON list
    conn.execute(sa.text(
        "UPDATE parental_review SET package_ids = '[' || package_id || ']' "
        "WHERE package_id IS NOT NULL AND package_ids IS NULL"
    ))


def downgrade() -> None:
    with op.batch_alter_table("parental_review") as batch_op:
        batch_op.drop_column("package_ids")
