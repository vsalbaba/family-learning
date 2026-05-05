"""Add unique constraint on parental_review_credit(review_id, item_id) and cancelled_at to parental_review.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add cancelled_at to parental_review if missing
    existing_pr_cols = {
        r[1] for r in conn.execute(sa.text("PRAGMA table_info('parental_review')")).fetchall()
    }
    if "cancelled_at" not in existing_pr_cols:
        op.add_column(
            "parental_review",
            sa.Column("cancelled_at", sa.DateTime, nullable=True),
        )

    # Add unique constraint on parental_review_credit(review_id, item_id)
    # SQLite doesn't support ALTER TABLE ADD CONSTRAINT; recreate table instead.
    existing_prc_indexes = {
        r[1] for r in conn.execute(sa.text("PRAGMA index_list('parental_review_credit')")).fetchall()
    }
    if "uq_prc_review_item" not in existing_prc_indexes:
        with op.batch_alter_table("parental_review_credit") as batch_op:
            batch_op.create_unique_constraint(
                "uq_prc_review_item", ["review_id", "item_id"]
            )


def downgrade() -> None:
    with op.batch_alter_table("parental_review_credit") as batch_op:
        batch_op.drop_constraint("uq_prc_review_item", type_="unique")

    with op.batch_alter_table("parental_review") as batch_op:
        batch_op.drop_column("cancelled_at")
