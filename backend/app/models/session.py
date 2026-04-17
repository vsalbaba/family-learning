from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LearningSession(Base):
    __tablename__ = "session"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    child_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id"), nullable=False
    )
    package_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("package.id"), nullable=True
    )
    subject: Mapped[str | None] = mapped_column(String, nullable=True)
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # JSON list of item IDs in lesson order
    item_ids: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    extension_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    answers: Mapped[list["Answer"]] = relationship(
        "Answer", back_populates="session", cascade="all, delete-orphan"
    )


class Answer(Base):
    __tablename__ = "answer"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("item.id"), nullable=False
    )
    child_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id"), nullable=False
    )
    given_answer: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    answered_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    session: Mapped["LearningSession"] = relationship(
        "LearningSession", back_populates="answers"
    )
