import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.session import Answer, LearningSession
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

    def test_requires_parent_auth(
        self, client, child_user, auth_headers_child
    ):
        resp = client.get(f"/api/children/{child_user.id}/progress", headers=auth_headers_child)
        assert resp.status_code == 403
