from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(pin: str, hashed: str) -> bool:
    return bcrypt.checkpw(pin.encode(), hashed.encode())


def create_token(user_id: int, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        return None


def get_parent(db: Session) -> User | None:
    return db.query(User).filter(User.role == "parent").first()


def setup_parent(db: Session, name: str, pin: str) -> User:
    user = User(name=name, role="parent", pin_hash=hash_pin(pin))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, name: str, pin: str) -> User | None:
    user = db.query(User).filter(User.name == name).first()
    if user and verify_pin(pin, user.pin_hash):
        return user
    return None
