import json
from pathlib import Path

from app.models.package import Item
from app.models.review import ReviewState
from app.models.session import Answer, LearningSession

FIXTURES = Path(__file__).parent / "fixtures"


class TestImport:
    def test_import_valid_package(self, client, auth_headers_parent, sample_package_json):
        resp = client.post(
            "/api/packages/import",
            json={"content": sample_package_json},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["validation"]["is_valid"] is True
        assert data["package"] is not None
        assert data["package"]["status"] == "draft"
        assert data["package"]["item_count"] == 7

    def test_import_invalid_json(self, client, auth_headers_parent):
        resp = client.post(
            "/api/packages/import",
            json={"content": "not json {{{"},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200  # Returns validation result, not HTTP error
        data = resp.json()
        assert data["validation"]["is_valid"] is False
        assert data["package"] is None
        assert len(data["validation"]["hard_errors"]) > 0

    def test_import_with_warnings(self, client, auth_headers_parent):
        raw = (FIXTURES / "warnings_only.json").read_text()
        resp = client.post(
            "/api/packages/import",
            json={"content": raw},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["validation"]["is_valid"] is True
        assert data["package"] is not None
        assert len(data["validation"]["soft_warnings"]) > 0

    def test_import_file_upload(self, client, auth_headers_parent, sample_package_json):
        resp = client.post(
            "/api/packages/import/file",
            files={"file": ("pkg.json", sample_package_json.encode(), "application/json")},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["validation"]["is_valid"] is True
        assert data["package"] is not None

    def test_child_cannot_import(self, client, auth_headers_child, sample_package_json):
        resp = client.post(
            "/api/packages/import",
            json={"content": sample_package_json},
            headers=auth_headers_child,
        )
        assert resp.status_code == 403


class TestList:
    def test_list_packages_as_parent(
        self, client, auth_headers_parent, published_package
    ):
        resp = client.get("/api/packages", headers=auth_headers_parent)
        assert resp.status_code == 200
        packages = resp.json()
        assert len(packages) >= 1

    def test_list_packages_as_child(
        self, client, auth_headers_child, published_package
    ):
        resp = client.get("/api/packages", headers=auth_headers_child)
        assert resp.status_code == 200
        packages = resp.json()
        # Child should only see published packages
        for pkg in packages:
            assert pkg["status"] == "published"


class TestGetPackage:
    def test_get_package_with_items(
        self, client, auth_headers_parent, published_package
    ):
        resp = client.get(
            f"/api/packages/{published_package.id}", headers=auth_headers_parent
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == published_package.name
        assert len(data["items"]) > 0


class TestPublish:
    def test_publish_draft_package(
        self, client, auth_headers_parent, sample_package_json
    ):
        # Import first
        resp = client.post(
            "/api/packages/import",
            json={"content": sample_package_json},
            headers=auth_headers_parent,
        )
        pkg_id = resp.json()["package"]["id"]

        # Publish
        resp = client.post(
            f"/api/packages/{pkg_id}/publish", headers=auth_headers_parent
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "published"

    def test_publish_sets_published_at(
        self, client, auth_headers_parent, sample_package_json
    ):
        resp = client.post(
            "/api/packages/import",
            json={"content": sample_package_json},
            headers=auth_headers_parent,
        )
        pkg_id = resp.json()["package"]["id"]
        resp = client.post(
            f"/api/packages/{pkg_id}/publish", headers=auth_headers_parent
        )
        assert resp.json()["published_at"] is not None

    def test_child_cannot_publish(
        self, client, auth_headers_child, published_package
    ):
        resp = client.post(
            f"/api/packages/{published_package.id}/publish",
            headers=auth_headers_child,
        )
        assert resp.status_code == 403


class TestArchive:
    def test_archive_published_package(
        self, client, auth_headers_parent, published_package
    ):
        resp = client.post(
            f"/api/packages/{published_package.id}/archive",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "archived"


class TestDelete:
    def test_delete_draft(self, client, auth_headers_parent, sample_package_json):
        resp = client.post(
            "/api/packages/import",
            json={"content": sample_package_json},
            headers=auth_headers_parent,
        )
        pkg_id = resp.json()["package"]["id"]
        resp = client.delete(
            f"/api/packages/{pkg_id}", headers=auth_headers_parent
        )
        assert resp.status_code == 204

    def test_delete_archived_package_with_answers(
        self, client, db_session, auth_headers_parent, published_package, child_user,
    ):
        """Deleting an archived package must cascade-clean Answer, ReviewState, and unlink sessions."""
        pkg = published_package
        item = pkg.items[0]

        # Create dependent records
        session = LearningSession(
            child_id=child_user.id,
            package_id=pkg.id,
            total_questions=1,
            correct_count=1,
            item_ids=json.dumps([item.id]),
        )
        db_session.add(session)
        db_session.flush()

        answer = Answer(
            session_id=session.id,
            item_id=item.id,
            child_id=child_user.id,
            given_answer='{"selected": 0}',
            is_correct=True,
        )
        db_session.add(answer)

        review = ReviewState(
            child_id=child_user.id,
            item_id=item.id,
            status="learning",
        )
        db_session.add(review)
        db_session.commit()

        session_id = session.id
        item_id = item.id

        # Archive first (can't delete published)
        resp = client.post(
            f"/api/packages/{pkg.id}/archive", headers=auth_headers_parent,
        )
        assert resp.status_code == 200

        # Delete
        resp = client.delete(
            f"/api/packages/{pkg.id}", headers=auth_headers_parent,
        )
        assert resp.status_code == 204

        # Verify cleanup
        assert db_session.query(Item).filter(Item.id == item_id).first() is None
        assert db_session.query(Answer).filter(Answer.item_id == item_id).count() == 0
        assert db_session.query(ReviewState).filter(ReviewState.item_id == item_id).count() == 0
        # Session should still exist but with package_id unlinked
        s = db_session.get(LearningSession, session_id)
        assert s is not None
        assert s.package_id is None

    def test_delete_published_blocked(
        self, client, auth_headers_parent, published_package
    ):
        resp = client.delete(
            f"/api/packages/{published_package.id}",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 409


class TestDeleteItem:
    def test_delete_item_with_answers_and_review_state(
        self, client, db_session, auth_headers_parent, published_package, child_user,
    ):
        """Deleting an item must cascade-delete Answer and ReviewState rows."""
        item = published_package.items[0]

        # Create a LearningSession + Answer referencing the item
        session = LearningSession(
            child_id=child_user.id,
            package_id=published_package.id,
            total_questions=1,
            correct_count=1,
            item_ids=json.dumps([item.id]),
        )
        db_session.add(session)
        db_session.flush()

        answer = Answer(
            session_id=session.id,
            item_id=item.id,
            child_id=child_user.id,
            given_answer='{"selected": 0}',
            is_correct=True,
        )
        db_session.add(answer)

        # Create a ReviewState referencing the item
        review = ReviewState(
            child_id=child_user.id,
            item_id=item.id,
            status="learning",
        )
        db_session.add(review)
        db_session.commit()

        # Verify dependent records exist
        assert db_session.query(Answer).filter(Answer.item_id == item.id).count() == 1
        assert db_session.query(ReviewState).filter(ReviewState.item_id == item.id).count() == 1

        # Delete the item via API
        resp = client.delete(
            f"/api/packages/{published_package.id}/items/{item.id}",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 204

        # Verify item and all dependent records are gone
        assert db_session.query(Item).filter(Item.id == item.id).first() is None
        assert db_session.query(Answer).filter(Answer.item_id == item.id).count() == 0
        assert db_session.query(ReviewState).filter(ReviewState.item_id == item.id).count() == 0


class TestExport:
    def test_export_package_json(
        self, client, auth_headers_parent, published_package
    ):
        resp = client.get(
            f"/api/packages/{published_package.id}/export",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "metadata" in data
        assert "items" in data
