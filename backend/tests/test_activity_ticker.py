"""Tests for daily activity ticker endpoints."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.session import Answer, LearningSession
from app.models.subject import Subject
from app.models.user import User
from app.services.auth_service import create_token, hash_pin


def _make_package(
    db: Session, parent: User, subject_slug: str, name: str, *, published: bool = True,
) -> Package:
    subj = db.query(Subject).filter(Subject.slug == subject_slug).one()
    pkg = Package(
        name=name,
        subject_id=subj.id,
        subject=subject_slug,
        status="published" if published else "draft",
        created_by=parent.id,
        raw_json="{}",
    )
    db.add(pkg)
    db.flush()
    return pkg


def _make_item(db: Session, pkg: Package, question: str = "Q?") -> Item:
    item = Item(
        package_id=pkg.id,
        sort_order=0,
        activity_type="true_false",
        question=question,
        answer_data=json.dumps({"correct_answer": True}),
    )
    db.add(item)
    db.flush()
    return item


def _make_answer(
    db: Session,
    child: User,
    item: Item,
    *,
    is_correct: bool = True,
    answered_at: datetime | None = None,
) -> Answer:
    session = LearningSession(
        child_id=child.id,
        package_id=item.package_id,
        total_questions=1,
        correct_count=1 if is_correct else 0,
        item_ids=json.dumps([item.id]),
        finished_at=answered_at or datetime.now(timezone.utc),
    )
    db.add(session)
    db.flush()
    answer = Answer(
        session_id=session.id,
        item_id=item.id,
        child_id=child.id,
        given_answer=json.dumps(True),
        is_correct=is_correct,
        response_time_ms=500,
        answered_at=answered_at or datetime.now(timezone.utc),
    )
    db.add(answer)
    db.commit()
    return answer


class TestDailyActivity:
    def test_no_answers(self, client, auth_headers_parent, child_user):
        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_tasks"] == 0
        assert data["subjects"] == []
        assert "date" in data

    def test_with_answers(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg = _make_package(db_session, parent_user, "matematika", "Mat 1")
        item = _make_item(db_session, pkg)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item, answered_at=now)
        _make_answer(db_session, child_user, item, is_correct=False, answered_at=now)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_tasks"] == 2
        assert len(data["subjects"]) == 1
        assert data["subjects"][0]["subject_slug"] == "matematika"
        assert data["subjects"][0]["task_count"] == 2

    def test_multiple_subjects(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg_m = _make_package(db_session, parent_user, "matematika", "Mat")
        item_m = _make_item(db_session, pkg_m)
        pkg_c = _make_package(db_session, parent_user, "cestina", "Cj")
        item_c = _make_item(db_session, pkg_c)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item_m, answered_at=now)
        _make_answer(db_session, child_user, item_c, answered_at=now)
        _make_answer(db_session, child_user, item_c, answered_at=now)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert data["total_tasks"] == 3
        assert len(data["subjects"]) == 2
        slugs = [s["subject_slug"] for s in data["subjects"]]
        assert "cestina" in slugs
        assert "matematika" in slugs

    def test_date_filter(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg = _make_package(db_session, parent_user, "matematika", "Mat")
        item = _make_item(db_session, pkg)
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).replace(
            hour=12, minute=0, second=0, microsecond=0, tzinfo=None,
        )
        today = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item, answered_at=yesterday)
        _make_answer(db_session, child_user, item, answered_at=today)

        yesterday_str = yesterday.strftime("%Y-%m-%d")
        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily?date={yesterday_str}",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert data["total_tasks"] == 1
        assert data["date"] == yesterday_str

    def test_subject_detail_packages(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg1 = _make_package(db_session, parent_user, "matematika", "Sčítání")
        item1 = _make_item(db_session, pkg1)
        pkg2 = _make_package(db_session, parent_user, "matematika", "Násobení")
        item2 = _make_item(db_session, pkg2)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item1, is_correct=True, answered_at=now)
        _make_answer(db_session, child_user, item2, is_correct=True, answered_at=now)
        _make_answer(db_session, child_user, item2, is_correct=False, answered_at=now)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily/subjects/matematika",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["subject_slug"] == "matematika"
        assert data["subject_name"] == "Matematika"
        assert data["subject_id"] is not None
        assert data["total_tasks"] == 3
        assert len(data["packages"]) == 2
        nasobeni = next(p for p in data["packages"] if p["package_name"] == "Násobení")
        assert nasobeni["task_count"] == 2
        assert nasobeni["correct_count"] == 1
        assert nasobeni["wrong_count"] == 1
        scitani = next(p for p in data["packages"] if p["package_name"] == "Sčítání")
        assert scitani["task_count"] == 1
        assert scitani["correct_count"] == 1
        assert scitani["wrong_count"] == 0

    def test_subject_detail_empty(
        self, client, auth_headers_parent, child_user,
    ):
        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily/subjects/matematika",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["packages"] == []
        assert data["total_tasks"] == 0

    def test_invalid_subject(self, client, auth_headers_parent, child_user):
        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily/subjects/neexistuje",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 404

    def test_wrong_parent(self, client, db_session, auth_headers_parent, child_user):
        other_parent = User(name="Jiný", role="parent", pin_hash=hash_pin("9999"))
        db_session.add(other_parent)
        db_session.flush()
        other_child = User(
            name="Cizí", role="child", pin_hash=hash_pin("8888"),
            parent_id=other_parent.id,
        )
        db_session.add(other_child)
        db_session.commit()

        resp = client.get(
            f"/api/children/{other_child.id}/activity/daily",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 404

    def test_child_role_forbidden(self, client, auth_headers_child, child_user):
        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_child,
        )
        assert resp.status_code == 403

    def test_invalid_date(self, client, auth_headers_parent, child_user):
        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily?date=not-a-date",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 400

    def test_day_boundary(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg = _make_package(db_session, parent_user, "matematika", "Mat")
        item = _make_item(db_session, pkg)
        day = datetime(2026, 5, 3, 21, 30, 0)
        next_day = datetime(2026, 5, 3, 22, 30, 0)
        _make_answer(db_session, child_user, item, answered_at=day)
        _make_answer(db_session, child_user, item, answered_at=next_day)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily?date=2026-05-04",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert data["total_tasks"] == 1

    def test_subject_mode_multiple_packages(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg_m = _make_package(db_session, parent_user, "matematika", "Mat pkg")
        item_m = _make_item(db_session, pkg_m)
        pkg_p = _make_package(db_session, parent_user, "prirodoveda", "Přír pkg")
        item_p = _make_item(db_session, pkg_p)
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        mat_subj = db_session.query(Subject).filter(Subject.slug == "matematika").one()
        session = LearningSession(
            child_id=child_user.id,
            package_id=None,
            subject_id=mat_subj.id,
            subject="matematika",
            total_questions=2,
            correct_count=2,
            item_ids=json.dumps([item_m.id, item_p.id]),
            finished_at=now,
        )
        db_session.add(session)
        db_session.flush()
        db_session.add(Answer(
            session_id=session.id, item_id=item_m.id, child_id=child_user.id,
            given_answer=json.dumps(True), is_correct=True, answered_at=now,
        ))
        db_session.add(Answer(
            session_id=session.id, item_id=item_p.id, child_id=child_user.id,
            given_answer=json.dumps(True), is_correct=True, answered_at=now,
        ))
        db_session.commit()

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert data["total_tasks"] == 2
        slugs = {s["subject_slug"]: s["task_count"] for s in data["subjects"]}
        assert slugs["matematika"] == 1
        assert slugs["prirodoveda"] == 1

    def test_repeated_answer_counts(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg = _make_package(db_session, parent_user, "matematika", "Mat")
        item = _make_item(db_session, pkg)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for _ in range(3):
            _make_answer(db_session, child_user, item, answered_at=now)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert data["subjects"][0]["task_count"] == 3

    def test_submit_answer_creates_visible_activity(
        self, client, db_session, auth_headers_parent, auth_headers_child,
        parent_user, child_user,
    ):
        pkg = _make_package(db_session, parent_user, "matematika", "Int test")
        item = Item(
            package_id=pkg.id,
            sort_order=0,
            activity_type="true_false",
            question="Je 2+2=4?",
            answer_data=json.dumps({"correct": True}),
        )
        db_session.add(item)
        db_session.commit()

        resp = client.post(
            "/api/lessons/start",
            json={"package_id": pkg.id, "question_count": 1},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        session_data = resp.json()
        session_id = session_data["session_id"]
        question = session_data["question"]

        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={
                "item_id": question["item_id"],
                "given_answer": json.dumps({"answer": True}),
            },
            headers=auth_headers_child,
        )
        assert resp.status_code == 200

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert data["total_tasks"] >= 1

    def test_default_date_uses_app_timezone(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg = _make_package(db_session, parent_user, "matematika", "Mat")
        item = _make_item(db_session, pkg)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item, answered_at=now)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert "date" in data
        assert data["total_tasks"] == 1

    def test_summary_includes_subject_id(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg = _make_package(db_session, parent_user, "matematika", "Mat")
        item = _make_item(db_session, pkg)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item, answered_at=now)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        subj = resp.json()["subjects"][0]
        assert "subject_id" in subj
        assert "subject_slug" in subj
        assert "subject_name" in subj
        assert "task_count" in subj

    def test_summary_ordering_by_sort_order_then_name(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg_c = _make_package(db_session, parent_user, "cestina", "Cj")
        item_c = _make_item(db_session, pkg_c)
        pkg_m = _make_package(db_session, parent_user, "matematika", "Mat")
        item_m = _make_item(db_session, pkg_m)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item_c, answered_at=now)
        _make_answer(db_session, child_user, item_m, answered_at=now)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        subjects = resp.json()["subjects"]
        assert subjects[0]["subject_slug"] == "cestina"
        assert subjects[1]["subject_slug"] == "matematika"

    def test_current_names_after_rename(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        pkg = _make_package(db_session, parent_user, "matematika", "Starý název")
        item = _make_item(db_session, pkg)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item, answered_at=now)

        pkg.name = "Nový název"
        db_session.commit()

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily/subjects/matematika",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert data["packages"][0]["package_name"] == "Nový název"

    def test_package_subject_id_invariant(
        self, client, db_session, auth_headers_parent, parent_user, child_user,
    ):
        subj = db_session.query(Subject).filter(Subject.slug == "nezarazeno").one()
        pkg = Package(
            name="No subject set",
            subject_id=None,
            status="published",
            created_by=parent_user.id,
            raw_json="{}",
        )
        db_session.add(pkg)
        db_session.flush()
        item = _make_item(db_session, pkg)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        _make_answer(db_session, child_user, item, answered_at=now)

        resp = client.get(
            f"/api/children/{child_user.id}/activity/daily",
            headers=auth_headers_parent,
        )
        data = resp.json()
        assert data["total_tasks"] == 0
