"""Simplified SM-2 spaced repetition algorithm."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.review import ReviewState

MAX_INTERVAL = 180


def update_review(state: ReviewState, is_correct: bool) -> ReviewState:
    """Update a review state based on answer correctness. Simplified SM-2."""
    now = datetime.now(timezone.utc)

    if not is_correct:
        state.repetitions = 0
        state.status = "review"
        state.ease_factor = max(1.3, state.ease_factor - 0.2)
        state.interval_days = 0
        state.next_review_at = now
        state.last_reviewed_at = now
        return state

    state.repetitions += 1

    if state.repetitions == 1:
        state.interval_days = 1
    elif state.repetitions == 2:
        state.interval_days = 3
    elif state.repetitions == 3:
        state.interval_days = 7
    else:
        state.interval_days = min(
            MAX_INTERVAL, round(state.interval_days * state.ease_factor)
        )

    if state.repetitions >= 3:
        state.status = "known"
    else:
        state.status = "learning"

    state.ease_factor = min(3.0, state.ease_factor + 0.1)
    state.next_review_at = now + timedelta(days=state.interval_days)
    state.last_reviewed_at = now
    return state


def get_or_create_review(
    db: Session, child_id: int, item_id: int
) -> ReviewState:
    """Get existing review state or create a new one."""
    state = (
        db.query(ReviewState)
        .filter(ReviewState.child_id == child_id, ReviewState.item_id == item_id)
        .first()
    )
    if state is None:
        state = ReviewState(child_id=child_id, item_id=item_id)
        db.add(state)
        db.flush()
    return state
