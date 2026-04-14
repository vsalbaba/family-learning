class TestChildManagement:
    def test_create_child(self, client, auth_headers_parent):
        resp = client.post(
            "/api/children",
            json={"name": "Honzík", "pin": "5678"},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Honzík"
        assert data["role"] == "child"

    def test_list_children(self, client, auth_headers_parent, child_user):
        resp = client.get("/api/children", headers=auth_headers_parent)
        assert resp.status_code == 200
        children = resp.json()
        assert len(children) >= 1
        assert any(c["name"] == "Dítě" for c in children)

    def test_update_child_name(self, client, auth_headers_parent, child_user):
        resp = client.put(
            f"/api/children/{child_user.id}",
            json={"name": "Nové Jméno"},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Nové Jméno"

    def test_update_child_pin(self, client, auth_headers_parent, child_user):
        resp = client.put(
            f"/api/children/{child_user.id}",
            json={"pin": "9999"},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200

        # Verify new PIN works
        resp = client.post(
            "/api/auth/login",
            json={"name": "Dítě", "pin": "9999"},
        )
        assert resp.status_code == 200

    def test_delete_child(self, client, auth_headers_parent, child_user):
        resp = client.delete(
            f"/api/children/{child_user.id}",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 204

    def test_child_cannot_manage_children(self, client, auth_headers_child):
        resp = client.get("/api/children", headers=auth_headers_child)
        assert resp.status_code == 403

        resp = client.post(
            "/api/children",
            json={"name": "Hacker", "pin": "0000"},
            headers=auth_headers_child,
        )
        assert resp.status_code == 403
