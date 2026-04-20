"""Authentication endpoints: setup, login, and user identity."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import LoginRequest, LoginResponse, SetupRequest, UserResponse
from app.config import settings
from app.services.auth_service import (
    authenticate,
    create_token,
    decode_token,
    get_parent,
    setup_parent,
)

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Extract and validate the current user from the Authorization header."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


def require_parent(user: User = Depends(get_current_user)) -> User:
    """Require the current user to have the parent role."""
    if user.role != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vyžadován přístup rodiče",
        )
    return user


def require_child(user: User = Depends(get_current_user)) -> User:
    """Require the current user to have the child role."""
    if user.role != "child":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vyžadován přístup dítěte",
        )
    return user


@router.get("/setup-status")
def setup_status(db: Session = Depends(get_db)):
    """Check whether a parent account has been created."""
    existing = get_parent(db)
    return {"parent_exists": existing is not None}


@router.post("/setup", response_model=UserResponse)
def setup(req: SetupRequest, db: Session = Depends(get_db)):
    """Create the initial parent account."""
    if req.app_pin != settings.parent_pin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nesprávný PIN aplikace",
        )
    existing = get_parent(db)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Rodičovský účet již existuje",
        )
    user = setup_parent(db, req.name, req.pin)
    logger.info("Parent setup: user_id=%d", user.id)
    return user


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token."""
    user = authenticate(db, req.name, req.pin)
    if not user:
        logger.warning("Failed login: name=%s", req.name)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nesprávné jméno nebo PIN",
        )
    logger.info("Login: user_id=%d role=%s", user.id, user.role)
    token = create_token(user.id, user.role)
    return LoginResponse(token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return user
