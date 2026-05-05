"""Tests for parental review endpoints, including /next-batch."""

import json

import pytest

from app.models.parental_review import ParentalReview
from app.models.session import LearningSession
from app.services.auth_service import create_token, hash_pin
from app.models.user import User


class TestCreateReview:
    def test_parent_can_create_review(
        self, client, auth_headers_parent, child_user, published_package
    ):
        resp = client.post(
            "/api/parental-reviews",
            json={
                "child_id": child_user.id,
                "package_id": published_package.id,
                "target_credits": 10,
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "active"
        assert data["target_credits"] == 10
        assert data["current_credits"] == 0
        assert data["package_id"] == published_package.id

    def test_child_cannot_create_review(
        self, client, auth_headers_child, child_user, published_package
    ):
        resp = client.post(
            "/api/parental-reviews",
            json={"child_id": child_user.id, "package_id": published_package.id},
            headers=auth_headers_child,
        )
        assert resp.status_code == 403

    def test_create_requires_exactly_one_scope(
        self, client, auth_headers_parent, child_user
    ):
        # Neither package_id nor subject_id
        resp = client.post(
            "/api/parental-reviews",
            json={"child_id": child_user.id, "target_credits": 5},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 422

    def test_create_wrong_child(
        self, client, db_session, auth_headers_parent, parent_user, published_package
    ):
        # Another parent's child
        other_parent = User(name="Other", role="parent", pin_hash=hash_pin("9999"))
        db_session.add(other_parent)
        db_session.commit()
        other_child = User(
            name="OtherChild", role="child", pin_hash=hash_pin("8888"),
            parent_id=other_parent.id,
        )
        db_session.add(other_child)
        db_session.commit()

        resp = client.post(
            "/api/parental-reviews",
            json={"child_id": other_child.id, "package_id": published_package.id},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 404


class TestListReviews:
    def test_parent_lists_own_reviews(
        self, client, auth_headers_parent, child_user, published_package, db_session,
        parent_user,
    ):
        review = ParentalReview(
            parent_id=parent_user.id,
            child_id=child_user.id,
            package_id=published_package.id,
            target_credits=15,
        )
        db_session.add(review)
        db_session.commit()

        resp = client.get("/api/parental-reviews", headers=auth_headers_parent)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert any(r["id"] == review.id for r in data)


class TestCancelReview:
    def test_parent_can_cancel(
        self, client, auth_headers_parent, child_user, published_package, db_session,
        parent_user,
    ):
        review = ParentalReview(
            parent_id=parent_user.id,
            child_id=child_user.id,
            package_id=published_package.id,
            target_credits=10,
        )
        db_session.add(review)
        db_session.commit()

        resp = client.patch(
            f"/api/parental-reviews/{review.id}/cancel",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"

    def test_cannot_cancel_already_cancelled(
        self, client, auth_headers_parent, child_user, published_package, db_session,
        parent_user,
    ):
        review = ParentalReview(
            parent_id=parent_user.id,
            child_id=child_user.id,
            package_id=published_package.id,
            target_credits=10,
            status="cancelled",
        )
        db_session.add(review)
        db_session.commit()

        resp = client.patch(
            f"/api/parental-reviews/{review.id}/cancel",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 400


class TestNextBatch:
    def _create_review(self, db_session, parent_user, child_user, published_package, **kwargs):
        review = ParentalReview(
            parent_id=parent_user.id,
            child_id=child_user.id,
            package_id=published_package.id,
            target_credits=kwargs.get("target_credits", 20),
            status=kwargs.get("status", "active"),
        )
        db_session.add(review)
        db_session.commit()
        db_session.refresh(review)
        return review

    def test_next_batch_creates_new_session(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = self._create_review(db_session, parent_user, child_user, published_package)

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data
        assert "question" in data
        assert data["review_progress"] == 0
        assert data["review_target"] == 20
        assert data["review_status"] == "active"

        # Verify a session was created in DB
        session = db_session.query(LearningSession).filter(
            LearningSession.id == data["session_id"]
        ).first()
        assert session is not None
        assert session.parental_review_id == review.id

    def test_next_batch_reuses_existing_session(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = self._create_review(db_session, parent_user, child_user, published_package)

        # First call — creates session
        resp1 = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            headers=auth_headers_child,
        )
        session_id_1 = resp1.json()["session_id"]

        # Second call — should reuse the same session (no answers given yet)
        resp2 = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            headers=auth_headers_child,
        )
        session_id_2 = resp2.json()["session_id"]

        assert session_id_1 == session_id_2

    def test_next_batch_returns_400_for_completed_review(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = self._create_review(
            db_session, parent_user, child_user, published_package,
            status="completed",
        )

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            headers=auth_headers_child,
        )
        assert resp.status_code == 400
        assert "splněno" in resp.json()["detail"]

    def test_next_batch_returns_400_for_cancelled_review(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = self._create_review(
            db_session, parent_user, child_user, published_package,
            status="cancelled",
        )

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            headers=auth_headers_child,
        )
        assert resp.status_code == 400
        assert "zrušeno" in resp.json()["detail"]

    def test_next_batch_closes_unrelated_sessions(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        # Start a regular lesson first (unrelated to any review)
        resp = client.post(
            "/api/lessons/start",
            json={"package_id": published_package.id, "question_count": 3},
            headers=auth_headers_child,
        )
        unrelated_session_id = resp.json()["session_id"]

        review = self._create_review(db_session, parent_user, child_user, published_package)

        # Calling /next-batch should close the unrelated session
        client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            headers=auth_headers_child,
        )

        unrelated = db_session.query(LearningSession).filter(
            LearningSession.id == unrelated_session_id
        ).first()
        db_session.expire(unrelated)
        assert unrelated.finished_at is not None

    def test_parent_cannot_call_next_batch(
        self, client, auth_headers_parent, child_user, published_package, db_session,
        parent_user,
    ):
        review = self._create_review(db_session, parent_user, child_user, published_package)

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 403

    def test_next_batch_404_on_missing_review(self, client, auth_headers_child):
        resp = client.post(
            "/api/parental-reviews/99999/next-batch",
            headers=auth_headers_child,
        )
        assert resp.status_code == 404

    def test_answer_includes_parental_review_block(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = self._create_review(
            db_session, parent_user, child_user, published_package, target_credits=5
        )

        batch_resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            headers=auth_headers_child,
        )
        data = batch_resp.json()
        session_id = data["session_id"]
        question = data["question"]

        # Submit a correct flashcard answer (most likely to pass)
        answer = json.dumps({"knew": True}) if question["activity_type"] == "flashcard" else json.dumps({"answer": True})
        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": question["item_id"], "given_answer": answer},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        ans_data = resp.json()
        # parental_review block must be present for sessions with review
        assert "parental_review" in ans_data
        pr = ans_data["parental_review"]
        assert pr["review_id"] == review.id
        assert pr["target"] == 5


class TestListChildReviews:
    def test_child_can_list_own_reviews(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = ParentalReview(
            parent_id=parent_user.id,
            child_id=child_user.id,
            package_id=published_package.id,
            target_credits=10,
        )
        db_session.add(review)
        db_session.commit()

        resp = client.get(
            f"/api/parental-reviews/child/{child_user.id}",
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any(r["id"] == review.id for r in data)

    def test_child_cannot_list_other_childs_reviews(
        self, client, db_session, auth_headers_child, parent_user, published_package
    ):
        child2 = User(
            name="Child2", role="child", pin_hash=hash_pin("1111"),
            parent_id=parent_user.id,
        )
        db_session.add(child2)
        db_session.commit()

        resp = client.get(
            f"/api/parental-reviews/child/{child2.id}",
            headers=auth_headers_child,
        )
        assert resp.status_code == 403
