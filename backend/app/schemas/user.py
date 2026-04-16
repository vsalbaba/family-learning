from datetime import datetime

from pydantic import BaseModel


class SetupRequest(BaseModel):
    name: str
    pin: str
    app_pin: str


class LoginRequest(BaseModel):
    name: str
    pin: str


class LoginResponse(BaseModel):
    token: str
    user: "UserResponse"


class UserResponse(BaseModel):
    id: int
    name: str
    role: str
    avatar: str | None = None
    created_at: datetime
    reward_progress: int = 0
    reward_streak: int = 0
    game_tokens: int = 0
    game_window_expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class ChildResponse(UserResponse):
    pin_plain: str | None = None


class ChildCreate(BaseModel):
    name: str
    pin: str
    avatar: str | None = None


class ChildUpdate(BaseModel):
    name: str | None = None
    pin: str | None = None
    avatar: str | None = None
