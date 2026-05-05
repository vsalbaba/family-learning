from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ParentalReview(Base):
    __tablename__ = "parental_review"
    __table_args__ = (
        Index("ix_pr_child_status", "child_id", "status"),
        Index("ix_pr_parent", "parent_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id"), nullable=False
    )
    child_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id"), nullable=False
    )

    # Scope: exactly one of package_id or subject_id is set
    package_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("package.id"), nullable=True
    )
    subject_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("subject.id"), nullable=True
    )
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)

    target_credits: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    current_credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # status: "active" | "completed" | "cancelled"
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")

    note: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ParentalReviewCredit(Base):
    __tablename__ = "parental_review_credit"
    __table_args__ = (
        Index("ix_prc_review", "review_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    review_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("parental_review.id"), nullable=False
    )
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("session.id"), nullable=False
    )
    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("item.id"), nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
