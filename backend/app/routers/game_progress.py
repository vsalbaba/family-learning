"""Per-user per-game progress: XP, private data, and public summary."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.game_progress import GameProgress
from app.models.user import User
from app.routers.auth import require_child
from app.schemas.game_progress import (
    GameKey,
    GameProgressResponse,
    GameProgressUpdateRequest,
)

router = APIRouter()

VALID_KEYS: set[str] = set(GameKey.__args__)


def _validate_game_key(game_key: str) -> GameKey:
    if game_key not in VALID_KEYS:
        raise HTTPException(status_code=422, detail=f"Invalid game_key: {game_key}")
    return game_key  # type: ignore[return-value]


def _to_response(row: GameProgress) -> GameProgressResponse:
    return GameProgressResponse(
        game_key=row.game_key,  # type: ignore[arg-type]
        xp=row.xp,
        data=row.data_json or {},
        summary=row.summary_json or {},
    )


def _default_response(game_key: GameKey) -> GameProgressResponse:
    return GameProgressResponse(game_key=game_key, xp=0, data={}, summary={})


@router.get("")
def get_all_progress(
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
) -> list[GameProgressResponse]:
    rows = (
        db.query(GameProgress)
        .filter(GameProgress.user_id == user.id)
        .all()
    )
    return [_to_response(r) for r in rows]


@router.get("/{game_key}")
def get_progress(
    game_key: str,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
) -> GameProgressResponse:
    key = _validate_game_key(game_key)
    row = (
        db.query(GameProgress)
        .filter(GameProgress.user_id == user.id, GameProgress.game_key == key)
        .first()
    )
    if not row:
        return _default_response(key)
    return _to_response(row)


@router.patch("/{game_key}")
def update_progress(
    game_key: str,
    req: GameProgressUpdateRequest,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
) -> GameProgressResponse:
    key = _validate_game_key(game_key)
    row = (
        db.query(GameProgress)
        .filter(GameProgress.user_id == user.id, GameProgress.game_key == key)
        .first()
    )
    if not row:
        row = GameProgress(
            user_id=user.id,
            game_key=key,
            xp=req.xp_delta,
            data_json=req.data_patch or {},
            summary_json=req.summary or {},
        )
        db.add(row)
    else:
        row.xp += req.xp_delta
        if req.data_patch:
            row.data_json = {**(row.data_json or {}), **req.data_patch}
        if req.summary is not None:
            row.summary_json = req.summary
    db.commit()
    db.refresh(row)
    return _to_response(row)
