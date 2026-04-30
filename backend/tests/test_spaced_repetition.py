from datetime import datetime, timedelta, timezone

import pytest

from app.models.review import ReviewState
from app.services.spaced_repetition import update_review


def _fresh_state() -> ReviewState:
    return ReviewState(
        child_id=1, item_id=1, status="learning",
        ease_factor=2.5, interval_days=0, repetitions=0,
    )


class TestCorrectAnswers:
    def test_first_correct_interval_1(self):
        state = _fresh_state()
        update_review(state, True)
        assert state.interval_days == 1
        assert state.repetitions == 1
        assert state.status == "learning"

    def test_second_correct_interval_3(self):
        state = _fresh_state()
        update_review(state, True)
        update_review(state, True)
        assert state.interval_days == 3
        assert state.repetitions == 2

    def test_third_correct_interval_7_becomes_known(self):
        state = _fresh_state()
        for _ in range(3):
            update_review(state, True)
        assert state.interval_days == 7
        assert state.status == "known"
        assert state.repetitions == 3

    def test_known_item_correct_multiplies_by_ease(self):
        state = _fresh_state()
        for _ in range(3):
            update_review(state, True)
        # 4th correct: interval = round(7 * ease_factor)
        ease_before = state.ease_factor
        update_review(state, True)
        expected = min(180, round(7 * ease_before))
        assert state.interval_days == expected


class TestWrongAnswers:
    def test_wrong_resets_to_review(self):
        state = _fresh_state()
        update_review(state, True)
        update_review(state, True)
        update_review(state, False)
        assert state.repetitions == 0
        assert state.interval_days == 0
        assert state.status == "review"

    def test_wrong_from_known_resets(self):
        state = _fresh_state()
        for _ in range(3):
            update_review(state, True)
        assert state.status == "known"
        update_review(state, False)
        assert state.status == "review"
        assert state.repetitions == 0


class TestEaseFactor:
    def test_increases_on_correct(self):
        state = _fresh_state()
        original = state.ease_factor
        update_review(state, True)
        assert state.ease_factor == pytest.approx(original + 0.1)

    def test_decreases_on_wrong(self):
        state = _fresh_state()
        original = state.ease_factor
        update_review(state, False)
        assert state.ease_factor == pytest.approx(original - 0.2)

    def test_min_1_3(self):
        state = _fresh_state()
        state.ease_factor = 1.3
        update_review(state, False)
        assert state.ease_factor == pytest.approx(1.3)

    def test_max_3_0(self):
        state = _fresh_state()
        state.ease_factor = 3.0
        update_review(state, True)
        assert state.ease_factor == pytest.approx(3.0)


class TestScheduling:
    def test_next_review_at_calculated(self):
        state = _fresh_state()
        before = datetime.now(timezone.utc)
        update_review(state, True)
        assert state.next_review_at is not None
        assert state.next_review_at >= before

    def test_interval_capped_at_180(self):
        state = _fresh_state()
        state.interval_days = 170
        state.ease_factor = 2.5
        state.repetitions = 5
        state.status = "known"
        update_review(state, True)
        assert state.interval_days <= 180
