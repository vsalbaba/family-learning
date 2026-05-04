import json

import pytest
from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.review import ReviewState
from app.models.session import Answer, LearningSession
from app.models.subject import Subject
from app.models.user import User
from app.services.lesson_engine import (
    build_subject_lesson_sequence,
    check_answer,
    get_next_question_item,
    start_lesson,
    start_subject_lesson,
    submit_answer,
)


def _make_item(db: Session, pkg: Package, activity_type: str, question: str, answer_data: dict, **kwargs) -> Item:
    item = Item(
        package_id=pkg.id,
        sort_order=kwargs.get("sort_order", 0),
        activity_type=activity_type,
        question=question,
        answer_data=json.dumps(answer_data),
        hint=kwargs.get("hint"),
        explanation=kwargs.get("explanation"),
    )
    db.add(item)
    db.flush()
    return item


# ── Answer checking per activity type ────────────────────────────


class TestFlashcard:
    def test_self_report_knew(self, db_session, published_package):
        item = _make_item(db_session, published_package, "flashcard", "Q?",
                          {"answer": "A"})
        assert check_answer(item, json.dumps({"knew": True})) is True

    def test_self_report_didnt_know(self, db_session, published_package):
        item = _make_item(db_session, published_package, "flashcard", "Q?",
                          {"answer": "A"})
        assert check_answer(item, json.dumps({"knew": False})) is False


class TestMultipleChoice:
    def test_correct_index(self, db_session, published_package):
        item = _make_item(db_session, published_package, "multiple_choice", "Q?",
                          {"options": ["A", "B", "C"], "correct": 1})
        assert check_answer(item, json.dumps({"selected": 1})) is True

    def test_wrong_index(self, db_session, published_package):
        item = _make_item(db_session, published_package, "multiple_choice", "Q?",
                          {"options": ["A", "B", "C"], "correct": 1})
        assert check_answer(item, json.dumps({"selected": 0})) is False


class TestTrueFalse:
    def test_correct_true(self, db_session, published_package):
        item = _make_item(db_session, published_package, "true_false", "Q?",
                          {"correct": True})
        assert check_answer(item, json.dumps({"answer": True})) is True

    def test_correct_false(self, db_session, published_package):
        item = _make_item(db_session, published_package, "true_false", "Q?",
                          {"correct": False})
        assert check_answer(item, json.dumps({"answer": False})) is True

    def test_wrong(self, db_session, published_package):
        item = _make_item(db_session, published_package, "true_false", "Q?",
                          {"correct": True})
        assert check_answer(item, json.dumps({"answer": False})) is False


class TestFillIn:
    def test_exact_match(self, db_session, published_package):
        item = _make_item(db_session, published_package, "fill_in", "Capital?",
                          {"accepted_answers": ["Prague", "Praha"]})
        assert check_answer(item, json.dumps({"text": "Prague"})) is True

    def test_case_insensitive(self, db_session, published_package):
        item = _make_item(db_session, published_package, "fill_in", "Capital?",
                          {"accepted_answers": ["Praha"], "case_sensitive": False})
        assert check_answer(item, json.dumps({"text": "praha"})) is True

    def test_case_sensitive(self, db_session, published_package):
        item = _make_item(db_session, published_package, "fill_in", "Capital?",
                          {"accepted_answers": ["Praha"], "case_sensitive": True})
        assert check_answer(item, json.dumps({"text": "praha"})) is False

    def test_wrong_answer(self, db_session, published_package):
        item = _make_item(db_session, published_package, "fill_in", "Capital?",
                          {"accepted_answers": ["Praha"]})
        assert check_answer(item, json.dumps({"text": "Brno"})) is False

    def test_whitespace_trimmed(self, db_session, published_package):
        item = _make_item(db_session, published_package, "fill_in", "Capital?",
                          {"accepted_answers": ["Praha"], "case_sensitive": False})
        assert check_answer(item, json.dumps({"text": "  Praha  "})) is True

    def test_diacritics_ignored(self, db_session, published_package):
        item = _make_item(db_session, published_package, "fill_in", "Capital?",
                          {"accepted_answers": ["Déšť"], "case_sensitive": False})
        assert check_answer(item, json.dumps({"text": "dest"})) is True

    def test_diacritics_with_case_sensitive(self, db_session, published_package):
        item = _make_item(db_session, published_package, "fill_in", "Capital?",
                          {"accepted_answers": ["Praha"], "case_sensitive": True})
        assert check_answer(item, json.dumps({"text": "praha"})) is False


class TestMatching:
    def test_correct_pairs(self, db_session, published_package):
        item = _make_item(db_session, published_package, "matching", "Match:",
                          {"pairs": [{"left": "A", "right": "1"}, {"left": "B", "right": "2"}]})
        given = {"pairs": [{"left": "A", "right": "1"}, {"left": "B", "right": "2"}]}
        assert check_answer(item, json.dumps(given)) is True

    def test_wrong_pair(self, db_session, published_package):
        item = _make_item(db_session, published_package, "matching", "Match:",
                          {"pairs": [{"left": "A", "right": "1"}, {"left": "B", "right": "2"}]})
        given = {"pairs": [{"left": "A", "right": "2"}, {"left": "B", "right": "1"}]}
        assert check_answer(item, json.dumps(given)) is False

    def test_order_independent(self, db_session, published_package):
        item = _make_item(db_session, published_package, "matching", "Match:",
                          {"pairs": [{"left": "A", "right": "1"}, {"left": "B", "right": "2"}]})
        given = {"pairs": [{"left": "B", "right": "2"}, {"left": "A", "right": "1"}]}
        assert check_answer(item, json.dumps(given)) is True


class TestOrdering:
    def test_correct_sequence(self, db_session, published_package):
        item = _make_item(db_session, published_package, "ordering", "Order:",
                          {"correct_order": ["A", "B", "C"]})
        assert check_answer(item, json.dumps({"order": ["A", "B", "C"]})) is True

    def test_wrong_sequence(self, db_session, published_package):
        item = _make_item(db_session, published_package, "ordering", "Order:",
                          {"correct_order": ["A", "B", "C"]})
        assert check_answer(item, json.dumps({"order": ["C", "A", "B"]})) is False


class TestMathInput:
    def test_exact_value(self, db_session, published_package):
        item = _make_item(db_session, published_package, "math_input", "?",
                          {"correct_value": 42, "tolerance": 0})
        assert check_answer(item, json.dumps({"value": 42})) is True

    def test_within_tolerance(self, db_session, published_package):
        item = _make_item(db_session, published_package, "math_input", "?",
                          {"correct_value": 42, "tolerance": 0.5})
        assert check_answer(item, json.dumps({"value": 42.1})) is True

    def test_outside_tolerance(self, db_session, published_package):
        item = _make_item(db_session, published_package, "math_input", "?",
                          {"correct_value": 42, "tolerance": 0.5})
        assert check_answer(item, json.dumps({"value": 43})) is False

    def test_zero_tolerance(self, db_session, published_package):
        item = _make_item(db_session, published_package, "math_input", "?",
                          {"correct_value": 10, "tolerance": 0})
        assert check_answer(item, json.dumps({"value": 10.01})) is False


# ── Session lifecycle ────────────────────────────────────────────


class TestSessionLifecycle:
    def test_start_lesson_creates_session(
        self, db_session, child_user, published_package
    ):
        session, first = start_lesson(db_session, child_user.id, published_package.id, 5)
        assert session.child_id == child_user.id
        assert session.package_id == published_package.id
        assert session.total_questions <= 5
        assert first is not None

    def test_start_lesson_selects_n_questions(
        self, db_session, child_user, published_package
    ):
        session, _ = start_lesson(db_session, child_user.id, published_package.id, 3)
        assert session.total_questions == 3

    def test_start_lesson_respects_requested_count(
        self, db_session, child_user, parent_user
    ):
        # Create package with 50 items
        pkg = Package(name="Big", status="published", created_by=parent_user.id)
        db_session.add(pkg)
        db_session.flush()
        for i in range(50):
            db_session.add(Item(
                package_id=pkg.id, sort_order=i, activity_type="true_false",
                question=f"Q{i}", answer_data=json.dumps({"correct": True}),
            ))
        db_session.commit()
        session, _ = start_lesson(db_session, child_user.id, pkg.id, 20)
        assert session.total_questions == 20

    def test_start_lesson_all_questions(
        self, db_session, child_user, parent_user
    ):
        pkg = Package(name="Big2", status="published", created_by=parent_user.id)
        db_session.add(pkg)
        db_session.flush()
        for i in range(15):
            db_session.add(Item(
                package_id=pkg.id, sort_order=i, activity_type="true_false",
                question=f"Q{i}", answer_data=json.dumps({"correct": True}),
            ))
        db_session.commit()
        # Requesting 999 ("all") should cap to actual item count
        session, _ = start_lesson(db_session, child_user.id, pkg.id, 999)
        assert session.total_questions == 15

    def test_start_lesson_min_questions_from_package(
        self, db_session, child_user, parent_user
    ):
        pkg = Package(name="Small", status="published", created_by=parent_user.id)
        db_session.add(pkg)
        db_session.flush()
        for i in range(3):
            db_session.add(Item(
                package_id=pkg.id, sort_order=i, activity_type="true_false",
                question=f"Q{i}", answer_data=json.dumps({"correct": True}),
            ))
        db_session.commit()
        session, _ = start_lesson(db_session, child_user.id, pkg.id, 10)
        assert session.total_questions == 3

    def test_submit_answer_records_answer(
        self, db_session, child_user, published_package
    ):
        session, first = start_lesson(db_session, child_user.id, published_package.id, 1)
        given = json.dumps({"knew": True}) if first.activity_type == "flashcard" else json.dumps({"answer": True})
        submit_answer(db_session, session, first.id, given, 1500)
        answers = db_session.query(Answer).filter(Answer.session_id == session.id).all()
        assert len(answers) == 1
        assert answers[0].response_time_ms == 1500

    def test_submit_answer_returns_feedback(
        self, db_session, child_user, published_package
    ):
        session, first = start_lesson(db_session, child_user.id, published_package.id, 1)
        given = json.dumps({"knew": True}) if first.activity_type == "flashcard" else json.dumps({"answer": True})
        feedback, reward_delta = submit_answer(db_session, session, first.id, given, None)
        assert isinstance(feedback.is_correct, bool)
        assert feedback.correct_answer is not None
        assert reward_delta is None  # no child_user passed

    def test_submit_all_answers_finishes_session(
        self, db_session, child_user, published_package
    ):
        session, first = start_lesson(db_session, child_user.id, published_package.id, 1)
        given = json.dumps({"knew": True}) if first.activity_type == "flashcard" else json.dumps({"answer": True})
        submit_answer(db_session, session, first.id, given, None)
        db_session.refresh(session)
        assert session.finished_at is not None

    def test_get_summary_correct_count(
        self, db_session, child_user, published_package
    ):
        session, first = start_lesson(db_session, child_user.id, published_package.id, 1)
        given = json.dumps({"knew": True}) if first.activity_type == "flashcard" else json.dumps({"answer": True})
        submit_answer(db_session, session, first.id, given, None)
        db_session.refresh(session)
        assert session.correct_count >= 0

    def test_cannot_answer_finished_session(
        self, db_session, child_user, published_package
    ):
        session, first = start_lesson(db_session, child_user.id, published_package.id, 1)
        given = json.dumps({"knew": True}) if first.activity_type == "flashcard" else json.dumps({"answer": True})
        submit_answer(db_session, session, first.id, given, None)
        db_session.refresh(session)
        with pytest.raises(ValueError, match="již ukončena"):
            submit_answer(db_session, session, first.id, given, None)

    def test_cannot_start_lesson_unpublished_package(
        self, db_session, child_user, parent_user
    ):
        pkg = Package(name="Draft", status="draft", created_by=parent_user.id)
        db_session.add(pkg)
        db_session.flush()
        db_session.add(Item(
            package_id=pkg.id, sort_order=0, activity_type="true_false",
            question="Q", answer_data=json.dumps({"correct": True}),
        ))
        db_session.commit()
        with pytest.raises(ValueError, match="není publikován"):
            start_lesson(db_session, child_user.id, pkg.id, 5)


# ── Review state updates via submit_answer ──────────────────────


class TestReviewStateUpdate:
    def _make_simple_package(self, db: Session, parent: User, n: int = 3) -> Package:
        pkg = Package(name="Simple", status="published", created_by=parent.id)
        db.add(pkg)
        db.flush()
        for i in range(n):
            db.add(Item(
                package_id=pkg.id, sort_order=i, activity_type="true_false",
                question=f"Q{i}", answer_data=json.dumps({"correct": True}),
            ))
        db.commit()
        db.refresh(pkg)
        return pkg

    def test_submit_answer_creates_review_state(
        self, db_session, child_user, parent_user
    ):
        pkg = self._make_simple_package(db_session, parent_user, 1)
        session, first = start_lesson(db_session, child_user.id, pkg.id, 1)
        submit_answer(db_session, session, first.id, json.dumps({"answer": True}), None)

        rs = db_session.query(ReviewState).filter(
            ReviewState.child_id == child_user.id,
            ReviewState.item_id == first.id,
        ).first()
        assert rs is not None
        assert rs.last_reviewed_at is not None

    def test_submit_answer_correct_sets_known_path(
        self, db_session, child_user, parent_user
    ):
        """3 correct answers → status 'known', interval grows."""
        pkg = self._make_simple_package(db_session, parent_user, 1)
        item = db_session.query(Item).filter(Item.package_id == pkg.id).first()

        for _ in range(3):
            session, first = start_lesson(db_session, child_user.id, pkg.id, 1)
            submit_answer(db_session, session, item.id, json.dumps({"answer": True}), None)

        rs = db_session.query(ReviewState).filter(
            ReviewState.child_id == child_user.id,
            ReviewState.item_id == item.id,
        ).first()
        assert rs.status == "known"
        assert rs.repetitions == 3
        assert rs.interval_days == 7

    def test_submit_answer_wrong_sets_learning(
        self, db_session, child_user, parent_user
    ):
        pkg = self._make_simple_package(db_session, parent_user, 1)
        session, first = start_lesson(db_session, child_user.id, pkg.id, 1)
        submit_answer(db_session, session, first.id, json.dumps({"answer": False}), None)

        rs = db_session.query(ReviewState).filter(
            ReviewState.child_id == child_user.id,
            ReviewState.item_id == first.id,
        ).first()
        assert rs.status == "review"
        assert rs.interval_days == 0

    def test_review_state_affects_next_lesson(
        self, db_session, child_user, parent_user
    ):
        """After wrong answer, the item should appear in subsequent lessons in review slots."""
        pkg = self._make_simple_package(db_session, parent_user, 10)
        items = db_session.query(Item).filter(Item.package_id == pkg.id).all()

        # First lesson: answer first item wrong
        session, first = start_lesson(db_session, child_user.id, pkg.id, 1)
        submit_answer(db_session, session, first.id, json.dumps({"answer": False}), None)

        # Second lesson: the wrong item should appear (as learning)
        session2, _ = start_lesson(db_session, child_user.id, pkg.id, 5)
        item_ids = json.loads(session2.item_ids)
        assert first.id in item_ids


# ── Subject lesson tests ──────────────────────────────────────


class TestSubjectLesson:
    def _get_subject_id(self, db: Session, slug: str) -> int:
        return db.query(Subject).filter_by(slug=slug).one().id

    def _make_pkg(self, db: Session, parent: User, subject_slug: str, n: int = 5) -> Package:
        subj = db.query(Subject).filter_by(slug=subject_slug).one()
        pkg = Package(
            name=f"Pkg-{subject_slug}-{n}",
            subject=subj.slug,
            subject_display=subj.name,
            subject_id=subj.id,
            status="published",
            created_by=parent.id,
        )
        db.add(pkg)
        db.flush()
        for i in range(n):
            db.add(Item(
                package_id=pkg.id, sort_order=i, activity_type="true_false",
                question=f"Q{i}", answer_data=json.dumps({"correct": True}),
            ))
        db.commit()
        db.refresh(pkg)
        return pkg

    def test_build_subject_lesson_selects_from_multiple_packages(
        self, db_session, child_user, parent_user
    ):
        pkg1 = self._make_pkg(db_session, parent_user, "matematika", 5)
        pkg2 = self._make_pkg(db_session, parent_user, "matematika", 5)
        math_id = self._get_subject_id(db_session, "matematika")
        items = build_subject_lesson_sequence(db_session, child_user.id, math_id, 7)
        assert len(items) == 7
        pkg_ids = {item.package_id for item in items}
        assert pkg1.id in pkg_ids
        assert pkg2.id in pkg_ids

    def test_build_subject_lesson_ignores_other_subjects(
        self, db_session, child_user, parent_user
    ):
        self._make_pkg(db_session, parent_user, "matematika", 5)
        self._make_pkg(db_session, parent_user, "cestina", 5)
        math_id = self._get_subject_id(db_session, "matematika")
        items = build_subject_lesson_sequence(db_session, child_user.id, math_id, 10)
        for item in items:
            pkg = db_session.query(Package).filter(Package.id == item.package_id).first()
            assert pkg.subject_id == math_id

    def test_build_subject_lesson_ignores_unpublished(
        self, db_session, child_user, parent_user
    ):
        math_id = self._get_subject_id(db_session, "matematika")
        self._make_pkg(db_session, parent_user, "matematika", 5)
        draft = Package(
            name="Draft", subject="matematika", subject_id=math_id,
            status="draft", created_by=parent_user.id,
        )
        db_session.add(draft)
        db_session.flush()
        db_session.add(Item(
            package_id=draft.id, sort_order=0, activity_type="true_false",
            question="DraftQ", answer_data=json.dumps({"correct": True}),
        ))
        db_session.commit()
        items = build_subject_lesson_sequence(db_session, child_user.id, math_id, 10)
        item_pkg_ids = {item.package_id for item in items}
        assert draft.id not in item_pkg_ids

    def test_start_subject_lesson_creates_session(
        self, db_session, child_user, parent_user
    ):
        math_id = self._get_subject_id(db_session, "matematika")
        self._make_pkg(db_session, parent_user, "matematika", 5)
        session, first = start_subject_lesson(
            db_session, child_user.id, math_id, 3,
            subject_slug="matematika",
        )
        assert session.package_id is None
        assert session.subject_id == math_id
        assert session.subject == "matematika"
        assert session.total_questions == 3
        assert first is not None

    def test_start_subject_lesson_no_packages_raises(
        self, db_session, child_user, parent_user
    ):
        nezarazeno_id = self._get_subject_id(db_session, "nezarazeno")
        with pytest.raises(ValueError, match="nejsou publikované balíčky"):
            start_subject_lesson(db_session, child_user.id, nezarazeno_id, 5)

    def test_start_subject_lesson_no_items_raises(
        self, db_session, child_user, parent_user
    ):
        nezarazeno_id = self._get_subject_id(db_session, "nezarazeno")
        pkg = Package(
            name="Empty", subject="nezarazeno", subject_id=nezarazeno_id,
            status="published", created_by=parent_user.id,
        )
        db_session.add(pkg)
        db_session.commit()
        with pytest.raises(ValueError, match="nejsou dostupné otázky"):
            start_subject_lesson(db_session, child_user.id, nezarazeno_id, 5)

    def test_subject_lesson_submit_answer_updates_review(
        self, db_session, child_user, parent_user
    ):
        math_id = self._get_subject_id(db_session, "matematika")
        self._make_pkg(db_session, parent_user, "matematika", 3)
        session, first = start_subject_lesson(
            db_session, child_user.id, math_id, 1,
            subject_slug="matematika",
        )
        submit_answer(db_session, session, first.id, json.dumps({"answer": True}), None)

        rs = db_session.query(ReviewState).filter(
            ReviewState.child_id == child_user.id,
            ReviewState.item_id == first.id,
        ).first()
        assert rs is not None
        assert rs.last_reviewed_at is not None

    def test_subject_lesson_full_lifecycle(
        self, db_session, child_user, parent_user
    ):
        """Start → answer all → session finishes."""
        math_id = self._get_subject_id(db_session, "matematika")
        self._make_pkg(db_session, parent_user, "matematika", 5)
        session, first = start_subject_lesson(
            db_session, child_user.id, math_id, 2,
            subject_slug="matematika",
        )
        assert session.total_questions == 2

        # Answer first
        submit_answer(db_session, session, first.id, json.dumps({"answer": True}), 100)
        next_item = get_next_question_item(db_session, session)
        assert next_item is not None

        # Answer second
        submit_answer(db_session, session, next_item.id, json.dumps({"answer": True}), 100)
        db_session.refresh(session)
        assert session.finished_at is not None
        assert session.correct_count == 2
