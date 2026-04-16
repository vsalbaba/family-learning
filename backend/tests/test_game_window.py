from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy.orm import Session

from app.models.user import User


def test_activate_window_consumes_token(
    client, child_user: User, db_session: Session, auth_headers_child,
):
    child_user.game_tokens = 3
    db_session.commit()

    resp = client.post("/api/rewards/activate-window", headers=auth_headers_child)
    assert resp.status_code == 200
    data = resp.json()
    assert data["game_tokens"] == 2
    assert "window_expires_at" in data
    assert data["remaining_seconds"] > 0


def test_activate_window_idempotent(
    client, child_user: User, db_session: Session, auth_headers_child,
):
    child_user.game_tokens = 3
    db_session.commit()

    resp1 = client.post("/api/rewards/activate-window", headers=auth_headers_child)
    assert resp1.status_code == 200
    d1 = resp1.json()

    resp2 = client.post("/api/rewards/activate-window", headers=auth_headers_child)
    assert resp2.status_code == 200
    d2 = resp2.json()

    assert d2["game_tokens"] == 2  # no second deduction
    assert d2["window_expires_at"] == d1["window_expires_at"]


def test_activate_window_no_tokens(
    client, child_user: User, db_session: Session, auth_headers_child,
):
    child_user.game_tokens = 0
    db_session.commit()

    resp = client.post("/api/rewards/activate-window", headers=auth_headers_child)
    assert resp.status_code == 400


def test_activate_window_expired_creates_new(
    client, child_user: User, db_session: Session, auth_headers_child,
):
    child_user.game_tokens = 2
    child_user.game_window_expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    db_session.commit()

    resp = client.post("/api/rewards/activate-window", headers=auth_headers_child)
    assert resp.status_code == 200
    data = resp.json()
    assert data["game_tokens"] == 1  # consumed a token
    # New window should be in the future
    expires = datetime.fromisoformat(data["window_expires_at"])
    assert expires > datetime.now(timezone.utc).replace(tzinfo=None)


def test_me_includes_game_window(
    client, child_user: User, db_session: Session, auth_headers_child,
):
    resp = client.get("/api/auth/me", headers=auth_headers_child)
    assert resp.status_code == 200
    data = resp.json()
    assert "game_window_expires_at" in data
    assert data["game_window_expires_at"] is None


def test_me_includes_active_window(
    client, child_user: User, db_session: Session, auth_headers_child,
):
    child_user.game_tokens = 1
    db_session.commit()

    client.post("/api/rewards/activate-window", headers=auth_headers_child)

    resp = client.get("/api/auth/me", headers=auth_headers_child)
    data = resp.json()
    assert data["game_window_expires_at"] is not None


def test_activate_window_custom_duration(
    client, child_user: User, db_session: Session, auth_headers_child,
):
    child_user.game_tokens = 1
    db_session.commit()

    with patch("app.routers.rewards.settings") as mock_settings:
        mock_settings.game_window_seconds = 60
        resp = client.post("/api/rewards/activate-window", headers=auth_headers_child)

    assert resp.status_code == 200
    data = resp.json()
    assert data["remaining_seconds"] == 60
