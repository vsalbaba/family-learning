"""Add parental_review and parental_review_credit tables; add parental_review_id to session.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create parental_review table if not already present
    existing_tables = {
        r[0] for r in conn.execute(
            sa.text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()
    }

    if "parental_review" not in existing_tables:
        op.create_table(
            "parental_review",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("parent_id", sa.Integer, sa.ForeignKey("user.id"), nullable=False),
            sa.Column("child_id", sa.Integer, sa.ForeignKey("user.id"), nullable=False),
            sa.Column("package_id", sa.Integer, sa.ForeignKey("package.id"), nullable=True),
            sa.Column("subject_id", sa.Integer, sa.ForeignKey("subject.id"), nullable=True),
            sa.Column("grade", sa.Integer, nullable=True),
            sa.Column("target_credits", sa.Integer, nullable=False, server_default="20"),
            sa.Column("current_credits", sa.Integer, nullable=False, server_default="0"),
            sa.Column("status", sa.String, nullable=False, server_default="active"),
            sa.Column("note", sa.String, nullable=True),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
            sa.Column("completed_at", sa.DateTime, nullable=True),
        )
        op.create_index("ix_pr_child_status", "parental_review", ["child_id", "status"])
        op.create_index("ix_pr_parent", "parental_review", ["parent_id"])

    if "parental_review_credit" not in existing_tables:
        op.create_table(
            "parental_review_credit",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("review_id", sa.Integer, sa.ForeignKey("parental_review.id"), nullable=False),
            sa.Column("session_id", sa.Integer, sa.ForeignKey("session.id"), nullable=False),
            sa.Column("item_id", sa.Integer, sa.ForeignKey("item.id"), nullable=False),
            sa.Column("granted_at", sa.DateTime, server_default=sa.func.now()),
        )
        op.create_index("ix_prc_review", "parental_review_credit", ["review_id"])

    # Add parental_review_id column to session if missing
    existing_cols = {
        r[1] for r in conn.execute(sa.text("PRAGMA table_info('session')")).fetchall()
    }
    if "parental_review_id" not in existing_cols:
        op.add_column(
            "session",
            sa.Column("parental_review_id", sa.Integer, nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    existing_cols = {
        r[1] for r in conn.execute(sa.text("PRAGMA table_info('session')")).fetchall()
    }
    if "parental_review_id" in existing_cols:
        # SQLite doesn't support DROP COLUMN in older versions; recreate table
        with op.batch_alter_table("session") as batch_op:
            batch_op.drop_column("parental_review_id")

    op.drop_index("ix_prc_review", table_name="parental_review_credit")
    op.drop_table("parental_review_credit")
    op.drop_index("ix_pr_child_status", table_name="parental_review")
    op.drop_index("ix_pr_parent", table_name="parental_review")
    op.drop_table("parental_review")
