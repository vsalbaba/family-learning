class TestGetProgress:
    def test_get_nonexistent_returns_defaults(self, client, auth_headers_child):
        resp = client.get("/api/game-progress/hero-walk", headers=auth_headers_child)
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_key"] == "hero-walk"
        assert data["xp"] == 0
        assert data["data"] == {}
        assert data["summary"] == {}

    def test_invalid_game_key_returns_422(self, client, auth_headers_child):
        resp = client.get("/api/game-progress/invalid-game", headers=auth_headers_child)
        assert resp.status_code == 422

    def test_parent_gets_403(self, client, auth_headers_parent):
        resp = client.get("/api/game-progress/hero-walk", headers=auth_headers_parent)
        assert resp.status_code == 403


class TestUpdateProgress:
    def test_patch_creates_new_progress(self, client, auth_headers_child):
        resp = client.patch(
            "/api/game-progress/arena-battle",
            json={"xp_delta": 50},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_key"] == "arena-battle"
        assert data["xp"] == 50
        assert data["data"] == {}
        assert data["summary"] == {}

    def test_patch_adds_xp_delta(self, client, auth_headers_child):
        client.patch(
            "/api/game-progress/farmageddon",
            json={"xp_delta": 30},
            headers=auth_headers_child,
        )
        resp = client.patch(
            "/api/game-progress/farmageddon",
            json={"xp_delta": 20},
            headers=auth_headers_child,
        )
        assert resp.json()["xp"] == 50

    def test_two_patches_accumulate(self, client, auth_headers_child):
        client.patch(
            "/api/game-progress/hero-walk",
            json={"xp_delta": 100},
            headers=auth_headers_child,
        )
        client.patch(
            "/api/game-progress/hero-walk",
            json={"xp_delta": 75},
            headers=auth_headers_child,
        )
        resp = client.get("/api/game-progress/hero-walk", headers=auth_headers_child)
        assert resp.json()["xp"] == 175

    def test_patch_shallow_merges_data(self, client, auth_headers_child):
        client.patch(
            "/api/game-progress/arena-battle",
            json={"data_patch": {"wins": 3, "best_streak": 5}},
            headers=auth_headers_child,
        )
        resp = client.patch(
            "/api/game-progress/arena-battle",
            json={"data_patch": {"wins": 4}},
            headers=auth_headers_child,
        )
        data = resp.json()["data"]
        assert data["wins"] == 4
        assert data["best_streak"] == 5

    def test_patch_without_summary_preserves_existing(self, client, auth_headers_child):
        client.patch(
            "/api/game-progress/hero-walk",
            json={"summary": {"label": "Lvl 1"}},
            headers=auth_headers_child,
        )
        resp = client.patch(
            "/api/game-progress/hero-walk",
            json={"xp_delta": 10},
            headers=auth_headers_child,
        )
        assert resp.json()["summary"]["label"] == "Lvl 1"

    def test_patch_with_summary_replaces_entire_summary(self, client, auth_headers_child):
        client.patch(
            "/api/game-progress/farmageddon",
            json={"summary": {"label": "Lvl 1", "progressText": "100 XP"}},
            headers=auth_headers_child,
        )
        resp = client.patch(
            "/api/game-progress/farmageddon",
            json={"summary": {"label": "Lvl 2"}},
            headers=auth_headers_child,
        )
        summary = resp.json()["summary"]
        assert summary["label"] == "Lvl 2"
        assert "progressText" not in summary

    def test_negative_xp_delta_returns_422(self, client, auth_headers_child):
        resp = client.patch(
            "/api/game-progress/hero-walk",
            json={"xp_delta": -5},
            headers=auth_headers_child,
        )
        assert resp.status_code == 422

    def test_excessive_xp_delta_returns_422(self, client, auth_headers_child):
        resp = client.patch(
            "/api/game-progress/hero-walk",
            json={"xp_delta": 1001},
            headers=auth_headers_child,
        )
        assert resp.status_code == 422

    def test_invalid_game_key_returns_422(self, client, auth_headers_child):
        resp = client.patch(
            "/api/game-progress/bad-key",
            json={"xp_delta": 10},
            headers=auth_headers_child,
        )
        assert resp.status_code == 422

    def test_parent_gets_403(self, client, auth_headers_parent):
        resp = client.patch(
            "/api/game-progress/hero-walk",
            json={"xp_delta": 10},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 403


class TestGetAllProgress:
    def test_returns_all_games_with_progress(self, client, auth_headers_child):
        client.patch(
            "/api/game-progress/hero-walk",
            json={"xp_delta": 10},
            headers=auth_headers_child,
        )
        client.patch(
            "/api/game-progress/arena-battle",
            json={"xp_delta": 20},
            headers=auth_headers_child,
        )
        resp = client.get("/api/game-progress", headers=auth_headers_child)
        assert resp.status_code == 200
        data = resp.json()
        keys = {item["game_key"] for item in data}
        assert "hero-walk" in keys
        assert "arena-battle" in keys
