"""Tests for package/subject progress detail endpoints."""

import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.review import ReviewState
from app.models.session import Answer, LearningSession
from app.models.user import User


@pytest.fixture
def package_with_items(db_session: Session, parent_user: User) -> Package:
    pkg = Package(
        name="Matematika 1",
        subject="math",
        subject_display="Matematika",
        status="published",
        created_by=parent_user.id,
    )
    db_session.add(pkg)
    db_session.flush()
    for i in range(3):
        db_session.add(Item(
            package_id=pkg.id,
            sort_order=i,
            activity_type="math_input",
            question=f"Kolik je {i+1}+1?",
            answer_data=json.dumps({"correct_value": i + 2}),
        ))
    db_session.commit()
    db_session.refresh(pkg)
    return pkg


@pytest.fixture
def second_package_same_subject(db_session: Session, parent_user: User) -> Package:
    pkg = Package(
        name="Matematika 2",
        subject="math",
        subject_display="Matematika",
        status="published",
        created_by=parent_user.id,
    )
    db_session.add(pkg)
    db_session.flush()
    for i in range(2):
        db_session.add(Item(
            package_id=pkg.id,
            sort_order=i,
            activity_type="fill_in",
            question=f"Doplň {i+10}",
            answer_data=json.dumps({"accepted_answers": [str(i + 10)]}),
        ))
    db_session.commit()
    db_session.refresh(pkg)
    return pkg


def _add_answers(
    db: Session, child: User, items: list[Item], correct_flags: list[bool],
    base_time: datetime | None = None,
):
    if base_time is None:
        base_time = datetime(2026, 4, 1, 10, 0, 0)
    sess = LearningSession(
        child_id=child.id,
        package_id=items[0].package_id,
        total_questions=len(items),
        correct_count=sum(correct_flags),
        finished_at=base_time + timedelta(minutes=5),
    )
    db.add(sess)
    db.flush()
    for i, (item, correct) in enumerate(zip(items, correct_flags)):
        db.add(Answer(
            session_id=sess.id,
            item_id=item.id,
            child_id=child.id,
            given_answer=json.dumps({"value": item.id if correct else -1}),
            is_correct=correct,
            answered_at=base_time + timedelta(minutes=i),
        ))
    db.commit()


def test_package_detail_items_and_counts(
    client, db_session, parent_user, child_user, auth_headers_parent,
    package_with_items,
):
    items = package_with_items.items
    _add_answers(db_session, child_user, items, [True, False, True])

    resp = client.get(
        f"/api/children/{child_user.id}/progress/package/{package_with_items.id}",
        headers=auth_headers_parent,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["scope_type"] == "package"
    assert data["package_id"] == package_with_items.id
    assert data["title"] == "Matematika 1"
    assert data["total_answers"] == 3

    detail_items = {it["item_id"]: it for it in data["items"]}
    assert len(detail_items) == 3
    for it in data["items"]:
        assert it["answer_count"] == 1
        assert it["package_name"] == "Matematika 1"

    assert detail_items[items[0].id]["correct_count"] == 1
    assert detail_items[items[0].id]["wrong_count"] == 0
    assert detail_items[items[1].id]["correct_count"] == 0
    assert detail_items[items[1].id]["wrong_count"] == 1


def test_no_review_state_means_unknown(
    client, db_session, parent_user, child_user, auth_headers_parent,
    package_with_items,
):
    resp = client.get(
        f"/api/children/{child_user.id}/progress/package/{package_with_items.id}",
        headers=auth_headers_parent,
    )
    data = resp.json()
    for it in data["items"]:
        assert it["mastery"] == "unknown"
    assert data["mastery_counts"] == {"unknown": 3, "learning": 0, "known": 0, "review": 0}


def test_mastery_from_review_state(
    client, db_session, parent_user, child_user, auth_headers_parent,
    package_with_items,
):
    items = package_with_items.items
    db_session.add(ReviewState(child_id=child_user.id, item_id=items[0].id, status="known"))
    db_session.add(ReviewState(child_id=child_user.id, item_id=items[1].id, status="review"))
    db_session.commit()

    resp = client.get(
        f"/api/children/{child_user.id}/progress/package/{package_with_items.id}",
        headers=auth_headers_parent,
    )
    data = resp.json()
    detail_items = {it["item_id"]: it for it in data["items"]}
    assert detail_items[items[0].id]["mastery"] == "known"
    assert detail_items[items[1].id]["mastery"] == "review"
    assert detail_items[items[2].id]["mastery"] == "unknown"
    assert data["mastery_counts"] == {"unknown": 1, "learning": 0, "known": 1, "review": 1}


def test_no_answers_returns_zeros(
    client, db_session, parent_user, child_user, auth_headers_parent,
    package_with_items,
):
    resp = client.get(
        f"/api/children/{child_user.id}/progress/package/{package_with_items.id}",
        headers=auth_headers_parent,
    )
    data = resp.json()
    assert data["total_answers"] == 0
    for it in data["items"]:
        assert it["answer_count"] == 0
        assert it["correct_count"] == 0
        assert it["wrong_count"] == 0
        assert it["last_answered_at"] is None


def test_recent_wrong_ordered_and_limited(
    client, db_session, parent_user, child_user, auth_headers_parent,
    package_with_items,
):
    items = package_with_items.items
    base = datetime(2026, 4, 1, 10, 0, 0)
    sess = LearningSession(
        child_id=child_user.id, package_id=package_with_items.id,
        total_questions=12, correct_count=0,
        finished_at=base + timedelta(hours=1),
    )
    db_session.add(sess)
    db_session.flush()
    for i in range(12):
        db_session.add(Answer(
            session_id=sess.id,
            item_id=items[i % 3].id,
            child_id=child_user.id,
            given_answer=json.dumps({"value": -i}),
            is_correct=False,
            answered_at=base + timedelta(minutes=i),
        ))
    db_session.commit()

    resp = client.get(
        f"/api/children/{child_user.id}/progress/package/{package_with_items.id}",
        headers=auth_headers_parent,
    )
    data = resp.json()
    wrong = data["recent_wrong"]
    assert len(wrong) == 10
    timestamps = [w["answered_at"] for w in wrong]
    assert timestamps == sorted(timestamps, reverse=True)
    for w in wrong:
        assert isinstance(w["correct_answer_data"], dict)
        assert isinstance(w["given_answer_data"], dict)


def test_nonexistent_package_404(
    client, db_session, parent_user, child_user, auth_headers_parent,
):
    resp = client.get(
        f"/api/children/{child_user.id}/progress/package/99999",
        headers=auth_headers_parent,
    )
    assert resp.status_code == 404


def test_wrong_parent_404(
    client, db_session, parent_user, child_user, auth_headers_parent,
    package_with_items,
):
    from app.services.auth_service import create_token, hash_pin
    other = User(name="Jiný rodič", role="parent", pin_hash=hash_pin("5555"))
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    headers = {"Authorization": f"Bearer {create_token(other.id, 'parent')}"}

    resp = client.get(
        f"/api/children/{child_user.id}/progress/package/{package_with_items.id}",
        headers=headers,
    )
    assert resp.status_code == 404


def test_subject_detail_aggregates(
    client, db_session, parent_user, child_user, auth_headers_parent,
    package_with_items, second_package_same_subject,
):
    items1 = package_with_items.items
    items2 = second_package_same_subject.items
    _add_answers(db_session, child_user, items1, [True, True, False])
    _add_answers(
        db_session, child_user, items2, [False, True],
        base_time=datetime(2026, 4, 2, 10, 0, 0),
    )

    resp = client.get(
        f"/api/children/{child_user.id}/progress/subject/math",
        headers=auth_headers_parent,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["scope_type"] == "subject"
    assert data["package_id"] is None
    assert data["subject"] == "math"
    assert data["title"] == "Matematika"
    assert len(data["items"]) == 5
    assert data["total_answers"] == 5

    pkg_names = {it["package_name"] for it in data["items"]}
    assert pkg_names == {"Matematika 1", "Matematika 2"}


def test_nonexistent_subject_404(
    client, db_session, parent_user, child_user, auth_headers_parent,
):
    resp = client.get(
        f"/api/children/{child_user.id}/progress/subject/nonexistent",
        headers=auth_headers_parent,
    )
    assert resp.status_code == 404
