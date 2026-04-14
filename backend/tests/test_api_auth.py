from datetime import datetime, timedelta, timezone

from jose import jwt

from app.config import settings


class TestSetup:
    def test_setup_creates_parent(self, client):
        resp = client.post("/api/auth/setup", json={"name": "Rodič", "pin": "1234"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Rodič"
        assert data["role"] == "parent"

    def test_setup_idempotent(self, client, parent_user):
        resp = client.post("/api/auth/setup", json={"name": "Another", "pin": "5678"})
        assert resp.status_code == 409


class TestLogin:
    def test_login_correct_pin(self, client, parent_user):
        resp = client.post("/api/auth/login", json={"name": "Rodič", "pin": "1234"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["name"] == "Rodič"

    def test_login_wrong_pin(self, client, parent_user):
        resp = client.post("/api/auth/login", json={"name": "Rodič", "pin": "9999"})
        assert resp.status_code == 401

    def test_login_unknown_user(self, client, parent_user):
        resp = client.post("/api/auth/login", json={"name": "Nobody", "pin": "1234"})
        assert resp.status_code == 401


class TestMe:
    def test_me_with_valid_token(self, client, auth_headers_parent):
        resp = client.get("/api/auth/me", headers=auth_headers_parent)
        assert resp.status_code == 200
        assert resp.json()["role"] == "parent"

    def test_me_without_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_me_with_expired_token(self, client, parent_user):
        payload = {
            "sub": str(parent_user.id),
            "role": "parent",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
