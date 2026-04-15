from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routers.auth import require_child

router = APIRouter()


@router.post("/consume-token")
def consume_token(
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    """Consume one game token. Atomic SQL prevents race conditions."""
    result = db.execute(
        text(
            "UPDATE user SET game_tokens = game_tokens - 1"
            " WHERE id = :uid AND game_tokens > 0"
        ),
        {"uid": user.id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=400, detail="No tokens available")
    db.refresh(user)
    return {"game_tokens": user.game_tokens}
