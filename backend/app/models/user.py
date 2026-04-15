from datetime import datetime

from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)  # 'parent' or 'child'
    pin_hash: Mapped[str] = mapped_column(String, nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("user.id"), nullable=True
    )
    avatar: Mapped[str | None] = mapped_column(String, nullable=True)
    pin_plain: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    reward_progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    game_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    children = relationship("User", backref="parent", remote_side="User.id", foreign_keys="User.parent_id")
