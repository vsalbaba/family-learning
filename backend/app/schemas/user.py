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

    model_config = {"from_attributes": True}


class ChildCreate(BaseModel):
    name: str
    pin: str
    avatar: str | None = None


class ChildUpdate(BaseModel):
    name: str | None = None
    pin: str | None = None
    avatar: str | None = None
