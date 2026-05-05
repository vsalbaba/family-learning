"""Tests for parental review endpoints, including /next-batch."""

import json
from datetime import datetime, timezone

import pytest

from app.models.parental_review import ParentalReview
from app.models.session import LearningSession
from app.services.auth_service import create_token, hash_pin
from app.models.user import User


def _create_review(db_session, parent_user, child_user, published_package, **kwargs):
    """Create a ParentalReview for testing. Shared across test classes."""
    pkg_ids = kwargs.get("package_ids", [published_package.id])
    review = ParentalReview(
        parent_id=parent_user.id,
        child_id=child_user.id,
        package_ids=json.dumps(pkg_ids),
        target_credits=kwargs.get("target_credits", 20),
        status=kwargs.get("status", "active"),
    )
    db_session.add(review)
    db_session.commit()
    db_session.refresh(review)
    return review


def _make_correct_answer(question: dict, db_session=None) -> str:
    """Build a JSON answer string that is guaranteed to be correct.

    For flashcard, no DB access is needed. For other types, we must read the
    item's raw answer_data from the DB since the child-facing answer_data is
    sanitized (correct answers stripped).
    """
    from app.models.package import Item

    at = question["activity_type"]
    if at == "flashcard":
        return json.dumps({"knew": True})

    assert db_session is not None, "db_session required for non-flashcard answers"
    item = db_session.query(Item).filter(Item.id == question["item_id"]).one()
    ad = json.loads(item.answer_data)

    if at == "multiple_choice":
        return json.dumps({"selected": ad["correct"]})
    if at == "true_false":
        return json.dumps({"answer": ad["correct"]})
    if at == "fill_in":
        return json.dumps({"text": ad["accepted_answers"][0]})
    if at == "matching":
        return json.dumps({"pairs": ad["pairs"]})
    if at == "ordering":
        return json.dumps({"order": ad["correct_order"]})
    if at == "math_input":
        return json.dumps({"value": ad["correct_value"]})
    raise ValueError(f"Unknown activity type: {at}")


class TestCreateReview:
    def test_parent_can_create_review(
        self, client, auth_headers_parent, child_user, published_package
    ):
        resp = client.post(
            "/api/parental-reviews",
            json={
                "child_id": child_user.id,
                "package_ids": [published_package.id],
                "target_credits": 10,
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "active"
        assert data["target_credits"] == 10
        assert data["current_credits"] == 0
        assert data["package_ids"] == [published_package.id]

    def test_child_cannot_create_review(
        self, client, auth_headers_child, child_user, published_package
    ):
        resp = client.post(
            "/api/parental-reviews",
            json={"child_id": child_user.id, "package_ids": [published_package.id]},
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
            json={"child_id": other_child.id, "package_ids": [published_package.id]},
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
            package_ids=json.dumps([published_package.id]),
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
            package_ids=json.dumps([published_package.id]),
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
            package_ids=json.dumps([published_package.id]),
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
    def test_next_batch_creates_new_session(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = _create_review(db_session, parent_user, child_user, published_package)

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
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
        review = _create_review(db_session, parent_user, child_user, published_package)

        # First call — creates session
        resp1 = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        session_id_1 = resp1.json()["session_id"]

        # Second call — should reuse the same session (no answers given yet)
        resp2 = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        session_id_2 = resp2.json()["session_id"]

        assert session_id_1 == session_id_2

    def test_next_batch_returns_400_for_completed_review(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = _create_review(
            db_session, parent_user, child_user, published_package,
            status="completed",
        )

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        assert resp.status_code == 400
        assert "splněno" in resp.json()["detail"]

    def test_next_batch_returns_400_for_cancelled_review(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = _create_review(
            db_session, parent_user, child_user, published_package,
            status="cancelled",
        )

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
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

        review = _create_review(db_session, parent_user, child_user, published_package)

        # Calling /next-batch should close the unrelated session
        client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
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
        review = _create_review(db_session, parent_user, child_user, published_package)

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 403

    def test_next_batch_404_on_missing_review(self, client, auth_headers_child):
        resp = client.post(
            "/api/parental-reviews/99999/next-batch",
            json={},
            headers=auth_headers_child,
        )
        assert resp.status_code == 404

    def test_answer_includes_parental_review_block(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = _create_review(
            db_session, parent_user, child_user, published_package, target_credits=5
        )

        batch_resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        data = batch_resp.json()
        session_id = data["session_id"]
        question = data["question"]

        answer = _make_correct_answer(question, db_session)
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
            package_ids=json.dumps([published_package.id]),
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


class TestCreditDeduplification:
    """Tests for unique-credit logic: each (review, item) pair is counted once."""

    def _get_batch_and_first_question(self, client, review_id, auth_headers_child):
        resp = client.post(
            f"/api/parental-reviews/{review_id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        data = resp.json()
        return data["session_id"], data["question"]

    def test_wrong_answer_does_not_increment_credits(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = _create_review(db_session, parent_user, child_user, published_package)
        session_id, question = self._get_batch_and_first_question(
            client, review.id, auth_headers_child
        )

        # Submit wrong answer
        wrong_answer = json.dumps({"answer": "__wrong_impossible__"})
        if question["activity_type"] == "flashcard":
            wrong_answer = json.dumps({"knew": False})

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": question["item_id"], "given_answer": wrong_answer},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        pr = resp.json().get("parental_review", {})
        # Credits should stay at 0
        assert pr.get("progress", 0) == 0
        assert pr.get("was_new_credit") is False

    def test_duplicate_correct_answer_does_not_count_twice(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        """Answering the same item correctly in two different sessions counts only once."""
        review = _create_review(
            db_session, parent_user, child_user, published_package, target_credits=50
        )

        # First batch — answer first question correctly
        session_id, question = self._get_batch_and_first_question(
            client, review.id, auth_headers_child
        )
        item_id = question["item_id"]
        correct_answer = _make_correct_answer(question, db_session)

        resp1 = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": correct_answer},
            headers=auth_headers_child,
        )
        assert resp1.status_code == 200
        pr1 = resp1.json()["parental_review"]
        assert pr1["was_new_credit"] is True
        progress_after_first = pr1["progress"]

        # Forcibly finish the current session so we can start a new batch
        db_session.query(LearningSession).filter(
            LearningSession.id == session_id
        ).update({"finished_at": datetime.now(timezone.utc)})
        db_session.commit()

        # Second batch — inject session with the same item_id to guarantee dedup test
        second_session = LearningSession(
            child_id=child_user.id,
            package_id=published_package.id,
            total_questions=1,
            correct_count=0,
            item_ids=json.dumps([item_id]),
            parental_review_id=review.id,
        )
        db_session.add(second_session)
        db_session.commit()
        db_session.refresh(second_session)

        resp2 = client.post(
            f"/api/lessons/{second_session.id}/answer",
            json={"item_id": item_id, "given_answer": correct_answer},
            headers=auth_headers_child,
        )
        assert resp2.status_code == 200
        pr2 = resp2.json()["parental_review"]
        assert pr2["progress"] == progress_after_first
        assert pr2["was_new_credit"] is False


class TestReviewCompletion:
    """Tests for review completion when credits reach target."""

    def test_review_completes_when_target_reached(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        """When a correct answer pushes credits to target, review becomes completed."""
        review = _create_review(
            db_session, parent_user, child_user, published_package, target_credits=1
        )

        batch_resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        assert batch_resp.status_code == 200
        data = batch_resp.json()
        session_id = data["session_id"]
        question = data["question"]

        answer = _make_correct_answer(question, db_session)
        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": question["item_id"], "given_answer": answer},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        ans = resp.json()
        pr = ans["parental_review"]

        assert pr["was_new_credit"] is True
        assert pr["is_completed"] is True
        db_session.expire_all()
        db_session.refresh(review)
        assert review.status == "completed"
        assert review.completed_at is not None

        # Session should also be closed
        sess = db_session.query(LearningSession).filter(
            LearningSession.id == session_id
        ).first()
        db_session.expire(sess)
        assert sess.finished_at is not None

        # next-batch should now return 400
        nb_resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        assert nb_resp.status_code == 400
        assert "splněno" in nb_resp.json()["detail"]


class TestMultiPackageReview:
    """Tests for creating and using reviews with multiple packages."""

    def _make_second_package(self, db_session, parent_user):
        from app.models.package import Item, Package
        from app.models.subject import Subject
        nezarazeno = db_session.query(Subject).filter_by(slug="nezarazeno").one()
        pkg = Package(
            name="Second Test Package",
            subject_id=nezarazeno.id,
            status="published",
            created_by=parent_user.id,
            raw_json="{}",
        )
        db_session.add(pkg)
        db_session.flush()
        item = Item(
            package_id=pkg.id,
            sort_order=0,
            activity_type="flashcard",
            question="Second pkg question",
            answer_data=json.dumps({"front": "Q", "back": "A"}),
        )
        db_session.add(item)
        db_session.commit()
        db_session.refresh(pkg)
        return pkg

    def test_create_review_multiple_packages(
        self, client, auth_headers_parent, child_user, published_package, db_session,
        parent_user,
    ):
        pkg2 = self._make_second_package(db_session, parent_user)
        resp = client.post(
            "/api/parental-reviews",
            json={
                "child_id": child_user.id,
                "package_ids": [published_package.id, pkg2.id],
                "target_credits": 10,
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert set(data["package_ids"]) == {published_package.id, pkg2.id}

    def test_next_batch_multi_package(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        pkg2 = self._make_second_package(db_session, parent_user)
        review = _create_review(
            db_session, parent_user, child_user, published_package,
            package_ids=[published_package.id, pkg2.id],
        )

        resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        assert "session_id" in resp.json()

    def test_create_review_empty_package_ids(
        self, client, auth_headers_parent, child_user,
    ):
        resp = client.post(
            "/api/parental-reviews",
            json={
                "child_id": child_user.id,
                "package_ids": [],
                "target_credits": 10,
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 422


class TestCancelSessionCleanup:
    """Tests that cancelling a review closes its linked open sessions."""

    def test_cancel_closes_linked_sessions(
        self, client, auth_headers_child, auth_headers_parent, child_user, published_package,
        db_session, parent_user,
    ):
        review = ParentalReview(
            parent_id=parent_user.id,
            child_id=child_user.id,
            package_ids=json.dumps([published_package.id]),
            target_credits=20,
        )
        db_session.add(review)
        db_session.commit()
        db_session.refresh(review)

        # Start a batch (creates a session)
        batch_resp = client.post(
            f"/api/parental-reviews/{review.id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        assert batch_resp.status_code == 200
        session_id = batch_resp.json()["session_id"]

        # Cancel the review
        cancel_resp = client.patch(
            f"/api/parental-reviews/{review.id}/cancel",
            headers=auth_headers_parent,
        )
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] == "cancelled"
        assert cancel_resp.json()["cancelled_at"] is not None

        # The linked session should now be closed
        from app.models.session import LearningSession
        sess = db_session.query(LearningSession).filter(
            LearningSession.id == session_id
        ).first()
        db_session.expire(sess)
        assert sess.finished_at is not None

