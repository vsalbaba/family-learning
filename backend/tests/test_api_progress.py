import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.session import Answer, LearningSession
from app.models.subject import Subject
from app.models.user import User


def _create_session_with_answers(
    db: Session,
    child: User,
    pkg: Package,
    items: list[Item],
    correct_flags: list[bool],
):
    """Helper to create a finished session with answers."""
    session = LearningSession(
        child_id=child.id,
        package_id=pkg.id,
        total_questions=len(items),
        correct_count=sum(correct_flags),
        item_ids=json.dumps([it.id for it in items]),
        finished_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.flush()
    for item, correct in zip(items, correct_flags):
        db.add(Answer(
            session_id=session.id,
            item_id=item.id,
            child_id=child.id,
            given_answer=json.dumps({"answer": True}),
            is_correct=correct,
            response_time_ms=1000,
        ))
    db.commit()
    return session


def _create_subject_session_with_answers(
    db: Session,
    child: User,
    subject_id: int,
    items: list[Item],
    correct_flags: list[bool],
    subject_slug: str | None = None,
):
    """Helper to create a finished subject-mode session with answers."""
    session = LearningSession(
        child_id=child.id,
        package_id=None,
        subject_id=subject_id,
        subject=subject_slug,
        total_questions=len(items),
        correct_count=sum(correct_flags),
        item_ids=json.dumps([it.id for it in items]),
        finished_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.flush()
    for item, correct in zip(items, correct_flags):
        db.add(Answer(
            session_id=session.id,
            item_id=item.id,
            child_id=child.id,
            given_answer=json.dumps({"answer": True}),
            is_correct=correct,
            response_time_ms=1000,
        ))
    db.commit()
    return session


class TestChildProgress:
    def test_returns_progress(
        self, client, db_session, parent_user, child_user, published_package, auth_headers_parent
    ):
        items = published_package.items[:2]
        _create_session_with_answers(db_session, child_user, published_package, items, [True, False])

        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_parent)
        assert resp.status_code == 200
        data = resp.json()
        assert data["child_id"] == child_user.id
        assert data["child_name"] == child_user.name
        assert data["total_sessions"] == 1
        assert data["total_correct"] == 1
        assert data["total_questions"] == 2
        assert data["overall_avg_pct"] == 50.0

    def test_package_stats(
        self, client, db_session, parent_user, child_user, published_package, auth_headers_parent
    ):
        items = published_package.items[:2]
        _create_session_with_answers(db_session, child_user, published_package, items, [True, True])
        _create_session_with_answers(db_session, child_user, published_package, items, [True, False])

        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_parent)
        data = resp.json()
        assert len(data["packages"]) == 1
        pkg_stat = data["packages"][0]
        assert pkg_stat["package_id"] == published_package.id
        assert pkg_stat["package_name"] == published_package.name
        assert pkg_stat["session_count"] == 2
        # avg: (2/2 + 1/2) / 2 sessions -> 3/4 total -> 75%
        assert pkg_stat["avg_score_pct"] == 75.0
        assert pkg_stat["best_score_pct"] == 100.0

    def test_weak_questions(
        self, client, db_session, parent_user, child_user, published_package, auth_headers_parent
    ):
        items = published_package.items[:2]
        # Answer item 0 wrong twice, item 1 correct both times
        _create_session_with_answers(db_session, child_user, published_package, items, [False, True])
        _create_session_with_answers(db_session, child_user, published_package, items, [False, True])

        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_parent)
        data = resp.json()
        weak = data["weak_questions"]
        assert len(weak) >= 1
        worst = weak[0]
        assert worst["item_id"] == items[0].id
        assert worst["wrong_count"] == 2
        assert worst["total_attempts"] == 2
        assert worst["error_rate_pct"] == 100.0
        assert "wrong_answers" in worst
        assert len(worst["wrong_answers"]) == 2
        assert "correct_answer" in worst

    def test_no_sessions(
        self, client, child_user, auth_headers_parent
    ):
        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_parent)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_sessions"] == 0
        assert data["packages"] == []
        assert data["weak_questions"] == []

    def test_child_not_found(
        self, client, auth_headers_parent
    ):
        resp = client.get("/api/children/9999/progress", headers=auth_headers_parent)
        assert resp.status_code == 404

    def test_subject_session_weak_questions(
        self, client, db_session, parent_user, child_user, published_package, auth_headers_parent
    ):
        """Wrong answers from subject-mode sessions must appear in weak_questions."""
        math = db_session.query(Subject).filter_by(slug="matematika").one()
        items = published_package.items[:2]
        _create_subject_session_with_answers(
            db_session, child_user, math.id, items, [False, True],
            subject_slug="matematika",
        )

        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_parent)
        data = resp.json()
        assert data["total_sessions"] == 1
        assert data["total_questions"] == 2
        assert data["total_correct"] == 1
        # The wrong answer must appear in weak_questions
        assert len(data["weak_questions"]) == 1
        assert data["weak_questions"][0]["item_id"] == items[0].id
        assert data["weak_questions"][0]["wrong_count"] == 1

    def test_subject_progress(
        self, client, db_session, parent_user, child_user, published_package, auth_headers_parent
    ):
        """Subject-mode sessions must appear in subject_progress."""
        math = db_session.query(Subject).filter_by(slug="matematika").one()
        items = published_package.items[:2]
        _create_subject_session_with_answers(
            db_session, child_user, math.id, items, [True, False],
            subject_slug="matematika",
        )
        _create_subject_session_with_answers(
            db_session, child_user, math.id, items, [True, True],
            subject_slug="matematika",
        )

        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_parent)
        data = resp.json()
        assert len(data["subject_progress"]) == 1
        sp = data["subject_progress"][0]
        assert sp["subject_id"] == math.id
        assert sp["subject_slug"] == "matematika"
        assert sp["subject"] == "Matematika"
        assert sp["session_count"] == 2
        assert sp["best_score_pct"] == 100.0
        assert len(data["packages"]) == 0

    def test_auto_closed_session_stats(
        self, client, db_session, parent_user, child_user, published_package, auth_headers_parent
    ):
        """Auto-closed sessions should only count actually answered questions in totals."""
        items = published_package.items[:3]
        # Simulate auto-closed session: 3 total_questions but only 1 answer
        session = LearningSession(
            child_id=child_user.id,
            package_id=published_package.id,
            total_questions=3,
            correct_count=1,
            item_ids=json.dumps([it.id for it in items]),
            finished_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        db_session.flush()
        db_session.add(Answer(
            session_id=session.id,
            item_id=items[0].id,
            child_id=child_user.id,
            given_answer=json.dumps({"answer": True}),
            is_correct=True,
            response_time_ms=1000,
        ))
        db_session.commit()

        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_parent)
        data = resp.json()
        # Should count 1 actual answer, not 3 total_questions
        assert data["total_questions"] == 1
        assert data["total_correct"] == 1
        assert data["overall_avg_pct"] == 100.0

    def test_requires_parent_auth(
        self, client, child_user, auth_headers_child
    ):
        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_child)
        assert resp.status_code == 403
