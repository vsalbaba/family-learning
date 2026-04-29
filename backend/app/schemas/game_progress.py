from typing import Any, Literal

from pydantic import BaseModel, Field

GameKey = Literal["hero-walk", "farmageddon", "arena-battle"]


class GameProgressUpdateRequest(BaseModel):
    xp_delta: int = Field(default=0, ge=0, le=1000)
    data_patch: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] | None = None


class GameProgressResponse(BaseModel):
    game_key: GameKey
    xp: int
    data: dict[str, Any]
    summary: dict[str, Any]
