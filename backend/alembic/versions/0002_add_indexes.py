"""Add indexes for common query patterns.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-17

Indexes on columns frequently used in WHERE/ORDER BY clauses:
- Package: subject + grade + status (subject browse, lesson start)
- ReviewState: child_id + next_review_at (due item lookup)
- ReviewState: child_id + status (learning item lookup)
- LearningSession: child_id + finished_at (active session lookup)
- Answer: child_id + is_correct (progress statistics)
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_package_subject_grade_status", "package", ["subject", "grade", "status"]
    )
    op.create_index(
        "ix_review_child_next", "review_state", ["child_id", "next_review_at"]
    )
    op.create_index(
        "ix_review_child_status", "review_state", ["child_id", "status"]
    )
    op.create_index(
        "ix_session_child_finished", "session", ["child_id", "finished_at"]
    )
    op.create_index(
        "ix_answer_child_correct", "answer", ["child_id", "is_correct"]
    )


def downgrade() -> None:
    op.drop_index("ix_answer_child_correct", table_name="answer")
    op.drop_index("ix_session_child_finished", table_name="session")
    op.drop_index("ix_review_child_status", table_name="review_state")
    op.drop_index("ix_review_child_next", table_name="review_state")
    op.drop_index("ix_package_subject_grade_status", table_name="package")
