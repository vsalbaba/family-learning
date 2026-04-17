"""Tests for grade-based token suppression in reward logic."""

import json

from types import SimpleNamespace

import pytest
from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.user import User
from app.services.reward_service import process_answer_reward


# --- Unit tests for process_answer_reward with token_eligible ---


def _make_user(progress=0, streak=0, tokens=0, grade=None):
    return SimpleNamespace(
        reward_progress=progress,
        reward_streak=streak,
        game_tokens=tokens,
        grade=grade,
    )


class TestTokenEligibleParam:
    def test_eligible_correct_gives_progress(self):
        user = _make_user(progress=0, streak=0)
        delta = process_answer_reward(user, is_correct=True, token_eligible=True)
        assert delta.progress_gained == 3
        assert delta.tokens_suppressed is False
        assert user.reward_progress == 3

    def test_ineligible_correct_no_progress(self):
        user = _make_user(progress=50, streak=3)
        delta = process_answer_reward(user, is_correct=True, token_eligible=False)
        assert delta.progress_gained == 0
        assert delta.tokens_suppressed is True
        assert user.reward_progress == 50  # unchanged

    def test_ineligible_correct_streak_still_increments(self):
        user = _make_user(progress=0, streak=3)
        delta = process_answer_reward(user, is_correct=True, token_eligible=False)
        assert user.reward_streak == 4
        assert delta.new_streak == 4

    def test_ineligible_wrong_streak_resets(self):
        user = _make_user(progress=50, streak=5)
        delta = process_answer_reward(user, is_correct=False, token_eligible=False)
        assert user.reward_streak == 0
        assert delta.tokens_suppressed is False  # wrong answer: no point reporting suppression

    def test_ineligible_no_token_even_at_threshold(self):
        user = _make_user(progress=98, streak=0, tokens=0)
        delta = process_answer_reward(user, is_correct=True, token_eligible=False)
        assert delta.token_earned is False
        assert user.game_tokens == 0
        assert user.reward_progress == 98  # unchanged

    def test_eligible_default_backward_compatible(self):
        user = _make_user(progress=0, streak=0)
        delta = process_answer_reward(user, is_correct=True)
        assert delta.progress_gained == 3
        assert delta.tokens_suppressed is False

    def test_ineligible_preserves_existing_tokens(self):
        user = _make_user(progress=50, streak=0, tokens=5)
        delta = process_answer_reward(user, is_correct=True, token_eligible=False)
        assert delta.game_tokens == 5
        assert user.game_tokens == 5


# --- Integration tests for grade-based suppression in submit_answer ---


def _make_package(db: Session, parent: User, grade=None, subject=None) -> Package:
    pkg = Package(
        name=f"Test grade={grade}",
        status="published",
        created_by=parent.id,
        grade=grade,
        subject=subject,
    )
    db.add(pkg)
    db.flush()
    item = Item(
        package_id=pkg.id,
        sort_order=0,
        activity_type="true_false",
        question="Je to pravda?",
        answer_data=json.dumps({"correct": True}),
    )
    db.add(item)
    db.commit()
    db.refresh(pkg)
    return pkg


class TestGradeTokenSuppression:
    """Integration tests: child grade vs package grade → token eligibility."""

    def test_below_grade_suppresses_tokens(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        child_user.grade = 5
        db_session.commit()
        pkg = _make_package(db_session, parent_user, grade=3)

        resp = client.post(
            "/api/lessons/start",
            json={"package_id": pkg.id, "question_count": 1},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        session_id = resp.json()["session_id"]
        item_id = resp.json()["question"]["item_id"]

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": '{"answer": true}'},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        reward = resp.json()["reward"]
        assert reward["progress_gained"] == 0
        assert reward["tokens_suppressed"] is True

    def test_same_grade_allows_tokens(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        child_user.grade = 5
        db_session.commit()
        pkg = _make_package(db_session, parent_user, grade=5)

        resp = client.post(
            "/api/lessons/start",
            json={"package_id": pkg.id, "question_count": 1},
            headers=auth_headers_child,
        )
        session_id = resp.json()["session_id"]
        item_id = resp.json()["question"]["item_id"]

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": '{"answer": true}'},
            headers=auth_headers_child,
        )
        reward = resp.json()["reward"]
        assert reward["progress_gained"] == 3
        assert reward["tokens_suppressed"] is False

    def test_above_grade_allows_tokens(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        child_user.grade = 3
        db_session.commit()
        pkg = _make_package(db_session, parent_user, grade=5)

        resp = client.post(
            "/api/lessons/start",
            json={"package_id": pkg.id, "question_count": 1},
            headers=auth_headers_child,
        )
        session_id = resp.json()["session_id"]
        item_id = resp.json()["question"]["item_id"]

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": '{"answer": true}'},
            headers=auth_headers_child,
        )
        reward = resp.json()["reward"]
        assert reward["progress_gained"] == 3
        assert reward["tokens_suppressed"] is False

    def test_null_package_grade_allows_tokens(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        child_user.grade = 5
        db_session.commit()
        pkg = _make_package(db_session, parent_user, grade=None)

        resp = client.post(
            "/api/lessons/start",
            json={"package_id": pkg.id, "question_count": 1},
            headers=auth_headers_child,
        )
        session_id = resp.json()["session_id"]
        item_id = resp.json()["question"]["item_id"]

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": '{"answer": true}'},
            headers=auth_headers_child,
        )
        reward = resp.json()["reward"]
        assert reward["tokens_suppressed"] is False

    def test_null_child_grade_allows_tokens(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        # child_user.grade is None by default
        pkg = _make_package(db_session, parent_user, grade=3)

        resp = client.post(
            "/api/lessons/start",
            json={"package_id": pkg.id, "question_count": 1},
            headers=auth_headers_child,
        )
        session_id = resp.json()["session_id"]
        item_id = resp.json()["question"]["item_id"]

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": '{"answer": true}'},
            headers=auth_headers_child,
        )
        reward = resp.json()["reward"]
        assert reward["tokens_suppressed"] is False

    def test_subject_review_same_grade_allows_tokens(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        """Subject+grade review at child's grade allows tokens."""
        child_user.grade = 5
        db_session.commit()
        _make_package(db_session, parent_user, grade=5, subject="matematika")

        resp = client.post(
            "/api/lessons/start",
            json={"subject": "matematika", "grade": 5, "question_count": 1},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        session_id = resp.json()["session_id"]
        item_id = resp.json()["question"]["item_id"]

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": '{"answer": true}'},
            headers=auth_headers_child,
        )
        reward = resp.json()["reward"]
        assert reward["tokens_suppressed"] is False

    def test_subject_review_below_grade_suppresses_tokens(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        """Subject review at a lower grade suppresses tokens."""
        child_user.grade = 4
        db_session.commit()
        _make_package(db_session, parent_user, grade=3, subject="matematika")

        resp = client.post(
            "/api/lessons/start",
            json={"subject": "matematika", "grade": 3, "question_count": 1},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        session_id = resp.json()["session_id"]
        item_id = resp.json()["question"]["item_id"]

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": item_id, "given_answer": '{"answer": true}'},
            headers=auth_headers_child,
        )
        reward = resp.json()["reward"]
        assert reward["progress_gained"] == 0
        assert reward["tokens_suppressed"] is True


class TestGradeDataModel:
    """Tests for grade/topic fields in package and child data model."""

    def test_import_package_with_grade_topic(
        self, client, auth_headers_parent,
    ):
        pkg_json = json.dumps({
            "metadata": {
                "name": "Matika 3",
                "subject": "Matematika",
                "grade": 3,
                "topic": "malá násobilka",
            },
            "items": [
                {"type": "true_false", "question": "2+2=4?", "correct": True},
            ],
        })
        resp = client.post(
            "/api/packages/import",
            json={"content": pkg_json},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        pkg = resp.json()["package"]
        assert pkg["grade"] == 3
        assert pkg["topic"] == "malá násobilka"

    def test_import_package_without_grade_topic(
        self, client, auth_headers_parent,
    ):
        pkg_json = json.dumps({
            "metadata": {"name": "Old package"},
            "items": [
                {"type": "true_false", "question": "Q?", "correct": True},
            ],
        })
        resp = client.post(
            "/api/packages/import",
            json={"content": pkg_json},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        pkg = resp.json()["package"]
        assert pkg["grade"] is None
        assert pkg["topic"] is None

    def test_update_package_grade_topic(
        self, client, db_session, parent_user, auth_headers_parent,
    ):
        pkg = _make_package(db_session, parent_user)
        resp = client.put(
            f"/api/packages/{pkg.id}",
            json={"grade": 5, "topic": "zlomky"},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        assert resp.json()["grade"] == 5
        assert resp.json()["topic"] == "zlomky"

    def test_clear_package_grade(
        self, client, db_session, parent_user, auth_headers_parent,
    ):
        pkg = _make_package(db_session, parent_user, grade=3)
        resp = client.put(
            f"/api/packages/{pkg.id}",
            json={"grade": 0},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        assert resp.json()["grade"] is None

    def test_export_includes_grade_topic(
        self, client, db_session, parent_user, auth_headers_parent,
    ):
        pkg = _make_package(db_session, parent_user, grade=4)
        resp = client.put(
            f"/api/packages/{pkg.id}",
            json={"topic": "zlomky"},
            headers=auth_headers_parent,
        )
        resp = client.get(
            f"/api/packages/{pkg.id}/export",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        meta = resp.json()["metadata"]
        assert meta["grade"] == 4
        assert meta["topic"] == "zlomky"

    def test_create_child_with_grade(
        self, client, auth_headers_parent,
    ):
        resp = client.post(
            "/api/children",
            json={"name": "Pája", "pin": "1234", "grade": 5},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 201
        assert resp.json()["grade"] == 5

    def test_update_child_grade(
        self, client, db_session, parent_user, child_user, auth_headers_parent,
    ):
        resp = client.put(
            f"/api/children/{child_user.id}",
            json={"grade": 3},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        assert resp.json()["grade"] == 3

    def test_clear_child_grade(
        self, client, db_session, parent_user, child_user, auth_headers_parent,
    ):
        child_user.grade = 5
        db_session.commit()
        resp = client.put(
            f"/api/children/{child_user.id}",
            json={"grade": 0},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        assert resp.json()["grade"] is None


class TestSubjectGradeReview:
    """Tests for subject+grade scoped review."""

    def test_list_subjects_groups_by_grade(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        _make_package(db_session, parent_user, grade=3, subject="matematika")
        _make_package(db_session, parent_user, grade=5, subject="matematika")

        resp = client.get("/api/lessons/subjects", headers=auth_headers_child)
        assert resp.status_code == 200
        subjects = resp.json()
        assert len(subjects) == 2
        displays = {s["display"] for s in subjects}
        assert "Matematika, 3. ročník" in displays or any("3. ročník" in d for d in displays)

    def test_subject_review_filters_by_grade(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        _make_package(db_session, parent_user, grade=3, subject="matematika")
        pkg5 = _make_package(db_session, parent_user, grade=5, subject="matematika")

        resp = client.post(
            "/api/lessons/start",
            json={"subject": "matematika", "grade": 5, "question_count": 1},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        # The selected item should come from the grade=5 package
        item_id = resp.json()["question"]["item_id"]
        assert item_id in [it.id for it in pkg5.items]

    def test_subject_review_no_matching_grade(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        _make_package(db_session, parent_user, grade=3, subject="matematika")

        resp = client.post(
            "/api/lessons/start",
            json={"subject": "matematika", "grade": 7, "question_count": 1},
            headers=auth_headers_child,
        )
        assert resp.status_code == 404


class TestGradeAwareSorting:
    """Tests for grade-aware package sorting for children."""

    def test_child_with_grade_sees_sorted_packages(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        child_user.grade = 5
        db_session.commit()

        pkg_low = _make_package(db_session, parent_user, grade=3)
        pkg_match = _make_package(db_session, parent_user, grade=5)
        pkg_high = _make_package(db_session, parent_user, grade=7)
        pkg_null = _make_package(db_session, parent_user, grade=None)

        resp = client.get("/api/packages", headers=auth_headers_child)
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()]
        # Matching/higher first, then null, then below
        match_idx = ids.index(pkg_match.id)
        high_idx = ids.index(pkg_high.id)
        null_idx = ids.index(pkg_null.id)
        low_idx = ids.index(pkg_low.id)
        assert match_idx < null_idx
        assert high_idx < null_idx
        assert null_idx < low_idx

    def test_child_without_grade_sees_all(
        self, client, db_session, parent_user, child_user, auth_headers_child,
    ):
        # child_user.grade is None by default
        _make_package(db_session, parent_user, grade=3)
        _make_package(db_session, parent_user, grade=5)

        resp = client.get("/api/packages", headers=auth_headers_child)
        assert resp.status_code == 200
        assert len(resp.json()) == 2
