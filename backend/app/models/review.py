from datetime import datetime

from sqlalchemy import Index, Integer, Float, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ReviewState(Base):
    __tablename__ = "review_state"
    __table_args__ = (
        UniqueConstraint("child_id", "item_id", name="uq_child_item"),
        Index("ix_review_child_next", "child_id", "next_review_at"),
        Index("ix_review_child_status", "child_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    child_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id"), nullable=False
    )
    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("item.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="new"
    )
    ease_factor: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
