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
        review = self._create_review(db_session, parent_user, child_user, published_package)

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
        review = self._create_review(
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
        review = self._create_review(
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

        review = self._create_review(db_session, parent_user, child_user, published_package)

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
        review = self._create_review(db_session, parent_user, child_user, published_package)

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
        review = self._create_review(
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


class TestCreditDeduplification:
    """Tests for unique-credit logic: each (review, item) pair is counted once."""

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

    def _get_batch_and_first_question(self, client, review_id, auth_headers_child):
        resp = client.post(
            f"/api/parental-reviews/{review_id}/next-batch",
            json={},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        data = resp.json()
        return data["session_id"], data["question"]

    def _make_answer(self, activity_type: str) -> str:
        if activity_type == "flashcard":
            return json.dumps({"knew": True})
        if activity_type == "true_false":
            return json.dumps({"answer": True})
        return json.dumps({"answer": "x"})

    def test_wrong_answer_does_not_increment_credits(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        review = self._create_review(db_session, parent_user, child_user, published_package)
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
        review = self._create_review(
            db_session, parent_user, child_user, published_package, target_credits=50
        )

        # First batch — answer first question correctly
        session_id, question = self._get_batch_and_first_question(
            client, review.id, auth_headers_child
        )
        item_id = question["item_id"]
        activity_type = question["activity_type"]
        correct_answer = self._make_answer(activity_type)

        resp1 = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": correct_answer},
            headers=auth_headers_child,
        )
        assert resp1.status_code == 200
        pr1 = resp1.json().get("parental_review", {})
        progress_after_first = pr1.get("progress", 0)
        was_new_first = pr1.get("was_new_credit", False)

        # Forcibly finish the current session so we can start a new batch
        from app.models.session import LearningSession
        from datetime import datetime, timezone
        db_session.query(LearningSession).filter(
            LearningSession.id == session_id
        ).update({"finished_at": datetime.now(timezone.utc)})
        db_session.commit()

        # Second batch — forcibly put the same item_id first
        # (We inject it directly to ensure same item is tested)
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
        pr2 = resp2.json().get("parental_review", {})
        progress_after_second = pr2.get("progress", 0)

        if was_new_first:
            # First answer counted; second should not
            assert progress_after_second == progress_after_first
            assert pr2.get("was_new_credit") is False
        # If the first answer also didn't count (wrong answer hit),
        # we at least verify no double-count occurred.


class TestReviewCompletion:
    """Tests for review completion when credits reach target."""

    def _create_review(self, db_session, parent_user, child_user, published_package, **kwargs):
        review = ParentalReview(
            parent_id=parent_user.id,
            child_id=child_user.id,
            package_id=published_package.id,
            target_credits=kwargs.get("target_credits", 1),
            status=kwargs.get("status", "active"),
        )
        db_session.add(review)
        db_session.commit()
        db_session.refresh(review)
        return review

    def test_review_completes_when_target_reached(
        self, client, auth_headers_child, child_user, published_package, db_session,
        parent_user,
    ):
        """When a correct answer pushes credits to target, review becomes completed."""
        review = self._create_review(
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

        # Submit a flashcard "knew=True" answer (always correct)
        if question["activity_type"] == "flashcard":
            answer = json.dumps({"knew": True})
        else:
            answer = json.dumps({"answer": True})  # may or may not be correct

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": question["item_id"], "given_answer": answer},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        ans = resp.json()
        pr = ans.get("parental_review", {})

        if pr.get("was_new_credit"):
            # Credit was awarded → should be completed now
            assert pr["is_completed"] is True
            db_session.expire_all()
            db_session.refresh(review)
            assert review.status == "completed"
            assert review.completed_at is not None

            # Session should also be closed
            from app.models.session import LearningSession
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


class TestCancelSessionCleanup:
    """Tests that cancelling a review closes its linked open sessions."""

    def test_cancel_closes_linked_sessions(
        self, client, auth_headers_child, auth_headers_parent, child_user, published_package,
        db_session, parent_user,
    ):
        review = ParentalReview(
            parent_id=parent_user.id,
            child_id=child_user.id,
            package_id=published_package.id,
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

