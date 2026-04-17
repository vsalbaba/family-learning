import json

import pytest
from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.session import LearningSession
from app.models.user import User


def _make_package(db: Session, parent: User, name: str, items: list[dict], status: str = "draft") -> Package:
    pkg = Package(name=name, status=status, created_by=parent.id)
    db.add(pkg)
    db.flush()
    for i, it in enumerate(items):
        db.add(Item(
            package_id=pkg.id,
            sort_order=i,
            activity_type="true_false",
            question=it["q"],
            answer_data=json.dumps({"correct": True}),
        ))
    db.commit()
    db.refresh(pkg)
    return pkg


class TestMergePackages:
    def test_basic_merge(self, client, db_session, parent_user, auth_headers_parent):
        target = _make_package(db_session, parent_user, "Target", [{"q": "T1"}, {"q": "T2"}])
        source = _make_package(db_session, parent_user, "Source", [{"q": "S1"}, {"q": "S2"}])

        resp = client.post(
            f"/api/packages/{target.id}/merge",
            json={"source_ids": [source.id]},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 4
        questions = [it["question"] for it in data["items"]]
        assert questions == ["T1", "T2", "S1", "S2"]

        # Source package should be deleted
        assert db_session.query(Package).filter(Package.id == source.id).first() is None

    def test_sort_order_appended(self, client, db_session, parent_user, auth_headers_parent):
        target = _make_package(db_session, parent_user, "Target", [{"q": "T1"}])
        source = _make_package(db_session, parent_user, "Source", [{"q": "S1"}, {"q": "S2"}])

        resp = client.post(
            f"/api/packages/{target.id}/merge",
            json={"source_ids": [source.id]},
            headers=auth_headers_parent,
        )
        data = resp.json()
        orders = [it["sort_order"] for it in data["items"]]
        assert orders == [0, 1, 2]

    def test_sessions_redirected(self, client, db_session, parent_user, child_user, auth_headers_parent):
        target = _make_package(db_session, parent_user, "Target", [{"q": "T1"}])
        source = _make_package(db_session, parent_user, "Source", [{"q": "S1"}])

        session = LearningSession(
            child_id=child_user.id,
            package_id=source.id,
            total_questions=1,
            item_ids="[]",
        )
        db_session.add(session)
        db_session.commit()
        session_id = session.id

        resp = client.post(
            f"/api/packages/{target.id}/merge",
            json={"source_ids": [source.id]},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200

        db_session.expire_all()
        updated_session = db_session.query(LearningSession).get(session_id)
        assert updated_session.package_id == target.id

    def test_review_state_preserved(self, client, db_session, parent_user, child_user, auth_headers_parent):
        """ReviewState references item_id which doesn't change during merge."""
        from app.models.review import ReviewState

        target = _make_package(db_session, parent_user, "Target", [{"q": "T1"}])
        source = _make_package(db_session, parent_user, "Source", [{"q": "S1"}])
        source_item_id = source.items[0].id

        rs = ReviewState(child_id=child_user.id, item_id=source_item_id)
        db_session.add(rs)
        db_session.commit()

        resp = client.post(
            f"/api/packages/{target.id}/merge",
            json={"source_ids": [source.id]},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200

        db_session.expire_all()
        review = db_session.query(ReviewState).filter(ReviewState.item_id == source_item_id).first()
        assert review is not None
        # Item should now belong to target
        item = db_session.query(Item).get(source_item_id)
        assert item.package_id == target.id

    def test_merge_multiple_sources(self, client, db_session, parent_user, auth_headers_parent):
        target = _make_package(db_session, parent_user, "Target", [{"q": "T1"}])
        src1 = _make_package(db_session, parent_user, "Src1", [{"q": "A1"}])
        src2 = _make_package(db_session, parent_user, "Src2", [{"q": "B1"}, {"q": "B2"}])

        resp = client.post(
            f"/api/packages/{target.id}/merge",
            json={"source_ids": [src1.id, src2.id]},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 4
        assert data["items"][0]["question"] == "T1"

    def test_source_not_found(self, client, db_session, parent_user, auth_headers_parent):
        target = _make_package(db_session, parent_user, "Target", [{"q": "T1"}])

        resp = client.post(
            f"/api/packages/{target.id}/merge",
            json={"source_ids": [9999]},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 404

    def test_target_in_source_ids(self, client, db_session, parent_user, auth_headers_parent):
        target = _make_package(db_session, parent_user, "Target", [{"q": "T1"}])

        resp = client.post(
            f"/api/packages/{target.id}/merge",
            json={"source_ids": [target.id]},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 400

    def test_merge_published_source(self, client, db_session, parent_user, auth_headers_parent):
        """Published source packages can be merged (internal operation)."""
        target = _make_package(db_session, parent_user, "Target", [{"q": "T1"}])
        source = _make_package(db_session, parent_user, "Source", [{"q": "S1"}], status="published")

        resp = client.post(
            f"/api/packages/{target.id}/merge",
            json={"source_ids": [source.id]},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 2
