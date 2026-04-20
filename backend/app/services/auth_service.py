"""PIN-based authentication and JWT token management."""

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User


def hash_pin(pin: str) -> str:
    """Hash a PIN using bcrypt."""
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(pin: str, hashed: str) -> bool:
    """Verify a PIN against its bcrypt hash."""
    return bcrypt.checkpw(pin.encode(), hashed.encode())


def create_token(user_id: int, role: str) -> str:
    """Create a JWT token for the given user."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        return None


def get_parent(db: Session) -> User | None:
    """Look up the parent user account."""
    return db.query(User).filter(User.role == "parent").first()


def setup_parent(db: Session, name: str, pin: str) -> User:
    """Create the initial parent account."""
    user = User(name=name, role="parent", pin_hash=hash_pin(pin))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, name: str, pin: str) -> User | None:
    """Authenticate a user by name and PIN."""
    user = db.query(User).filter(func.lower(User.name) == name.lower()).first()
    if user and verify_pin(pin, user.pin_hash):
        return user
    return None
