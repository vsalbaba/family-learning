"""Game window activation and token management."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.routers.auth import require_child

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/activate-window")
def activate_window(
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    """Activate a timed game window. Idempotent: returns existing window if active."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Active window exists — return it without consuming a token
    if user.game_window_expires_at and user.game_window_expires_at > now:
        remaining = int((user.game_window_expires_at - now).total_seconds())
        return {
            "game_tokens": user.game_tokens,
            "window_expires_at": user.game_window_expires_at.isoformat(),
            "remaining_seconds": remaining,
        }

    # No active window — consume token and create one
    expires = now + timedelta(seconds=settings.game_window_seconds)
    result = db.execute(
        text(
            "UPDATE user SET game_tokens = game_tokens - 1,"
            " game_window_expires_at = :expires"
            " WHERE id = :uid AND game_tokens > 0"
        ),
        {"uid": user.id, "expires": expires.isoformat()},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=400, detail="Žádné dostupné žetony")
    db.refresh(user)
    logger.info("Game window activated: user_id=%d expires=%s", user.id, user.game_window_expires_at)
    return {
        "game_tokens": user.game_tokens,
        "window_expires_at": user.game_window_expires_at.isoformat(),
        "remaining_seconds": settings.game_window_seconds,
    }
