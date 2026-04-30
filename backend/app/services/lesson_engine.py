"""Lesson item selection and answer evaluation engine."""

import json
import logging
import random
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.review import ReviewState
from app.models.session import Answer, LearningSession
from app.models.user import User
from app.services.reward_service import RewardDelta, process_answer_reward
from app.services.spaced_repetition import get_or_create_review, update_review

logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class LessonConfig:
    """Tuning parameters for lesson item selection.

    These control the balance between review, new, and filler items
    in each lesson, as well as anti-repeat penalties and extension limits.
    """

    review_max_ratio: float = 0.4
    """Maximum fraction of lesson slots for review (learning + due) items."""

    new_target_ratio: float = 0.4
    """Target fraction of lesson slots for unseen items."""

    anti_repeat_hard_hours: int = 6
    """Hours after answering during which an item is strongly suppressed."""

    anti_repeat_soft_hours: int = 24
    """Hours after answering during which an item is mildly suppressed."""

    anti_repeat_hard_penalty: int = 1000
    """Score penalty applied within the hard-repeat window."""

    anti_repeat_soft_penalty: int = 200
    """Score penalty applied within the soft-repeat window."""

    learning_ease_weight: int = 100
    """Weight of ease factor in scoring items still in the learning phase."""

    learning_overdue_bonus: int = 50
    """Bonus score for learning items that are past their review date."""

    due_overdue_hours_weight: int = 2
    """Per-hour score weight for overdue review items."""

    due_overdue_max_score: int = 200
    """Cap on the overdue score contribution for due items."""

    due_ease_weight: int = 40
    """Weight of ease factor in scoring due review items."""

    not_due_ease_weight: int = 20
    """Weight of ease factor in scoring items not yet due for review."""

    extension_question_count: int = 10
    """Number of questions added when a lesson is extended."""

    max_extensions: int = 2
    """Maximum number of times a lesson can be extended."""


LESSON_CONFIG = LessonConfig()

# Explicit budget table for known lesson sizes: (review_max, new_target, filler)
_BUDGET_TABLE: dict[int, tuple[int, int, int]] = {
    3: (1, 1, 1),
    5: (2, 2, 1),
    7: (3, 3, 1),
    10: (4, 4, 2),
    20: (8, 8, 4),
}


@dataclass
class Feedback:
    is_correct: bool
    correct_answer: str  # JSON string
    explanation: str | None


def _normalize(text: str) -> str:
    """Lowercase and strip diacritics (háčky, čárky) for lenient comparison."""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if unicodedata.category(c) != "Mn")


def check_answer(item: Item, given_answer_json: str) -> bool:
    """Check if the given answer is correct for the item's activity type."""
    answer_data = json.loads(item.answer_data)
    given = json.loads(given_answer_json)
    activity = item.activity_type

    if activity == "flashcard":
        # Self-reported: child says "knew" or "didnt_know"
        return given.get("knew", False) is True

    if activity == "multiple_choice":
        return given.get("selected") == answer_data.get("correct")

    if activity == "true_false":
        return given.get("answer") == answer_data.get("correct")

    if activity == "fill_in":
        user_text = str(given.get("text", "")).strip()
        accepted = answer_data.get("accepted_answers", [])
        case_sensitive = answer_data.get("case_sensitive", False)
        if case_sensitive:
            return user_text in [a.strip() for a in accepted]
        return _normalize(user_text) in [_normalize(a.strip()) for a in accepted]

    if activity == "matching":
        # given: list of {"left": ..., "right": ...}
        # answer_data: {"pairs": [{"left": ..., "right": ...}, ...]}
        correct_pairs = {
            (p["left"], p["right"]) for p in answer_data.get("pairs", [])
        }
        given_pairs = {
            (p.get("left", ""), p.get("right", ""))
            for p in given.get("pairs", [])
        }
        return correct_pairs == given_pairs

    if activity == "ordering":
        correct_order = answer_data.get("correct_order", [])
        given_order = given.get("order", [])
        return correct_order == given_order

    if activity == "math_input":
        try:
            correct_val = float(answer_data.get("correct_value", 0))
            given_val = float(given.get("value", ""))
            tolerance = float(answer_data.get("tolerance", 0))
            return abs(correct_val - given_val) <= tolerance
        except (ValueError, TypeError):
            return False

    return False


def get_correct_answer_display(item: Item) -> str:
    """Return the correct answer as a JSON string for display to child."""
    answer_data = json.loads(item.answer_data)
    activity = item.activity_type

    if activity == "flashcard":
        return json.dumps({"answer": answer_data.get("answer", "")})
    if activity == "multiple_choice":
        options = answer_data.get("options", [])
        correct_idx = answer_data.get("correct", 0)
        correct_text = options[correct_idx] if correct_idx < len(options) else ""
        return json.dumps({"correct_index": correct_idx, "correct_text": correct_text})
    if activity == "true_false":
        return json.dumps({"correct": answer_data.get("correct")})
    if activity == "fill_in":
        return json.dumps({"accepted_answers": answer_data.get("accepted_answers", [])})
    if activity == "matching":
        return json.dumps({"pairs": answer_data.get("pairs", [])})
    if activity == "ordering":
        return json.dumps({"correct_order": answer_data.get("correct_order", [])})
    if activity == "math_input":
        return json.dumps({
            "correct_value": answer_data.get("correct_value"),
            "unit": answer_data.get("unit", ""),
        })
    return "{}"


def get_child_answer_data(item: Item) -> str:
    """Return answer_data suitable for the child (e.g., options without correct index)."""
    answer_data = json.loads(item.answer_data)
    activity = item.activity_type

    if activity == "flashcard":
        return json.dumps({"answer": answer_data.get("answer", "")})
    if activity == "multiple_choice":
        options = list(answer_data.get("options", []))
        indices = list(range(len(options)))
        random.shuffle(indices)
        shuffled = [options[i] for i in indices]
        return json.dumps({"options": shuffled, "index_map": indices})
    if activity == "true_false":
        return json.dumps({})
    if activity == "fill_in":
        result = {}
        if answer_data.get("case_sensitive"):
            result["case_sensitive"] = True
        return json.dumps(result)
    if activity == "matching":
        pairs = answer_data.get("pairs", [])
        lefts = [p["left"] for p in pairs]
        rights = [p["right"] for p in pairs]
        random.shuffle(rights)
        return json.dumps({"lefts": lefts, "rights": rights})
    if activity == "ordering":
        items_list = list(answer_data.get("correct_order", []))
        random.shuffle(items_list)
        return json.dumps({"items": items_list})
    if activity == "math_input":
        result = {}
        if "unit" in answer_data:
            result["unit"] = answer_data["unit"]
        return json.dumps(result)
    return "{}"


def _get_budget(count: int) -> tuple[int, int, int]:
    """Return (review_max, new_target, filler_target) for a lesson of given size."""
    if count in _BUDGET_TABLE:
        return _BUDGET_TABLE[count]
    review_max = round(count * LESSON_CONFIG.review_max_ratio)
    new_target = round(count * LESSON_CONFIG.new_target_ratio)
    filler_target = count - review_max - new_target
    return (review_max, new_target, filler_target)


def _classify_and_score(
    item: Item, rs: ReviewState | None, now: datetime, all_mode: bool
) -> tuple[str, float]:
    """Return (category, score) for an item based on its review state."""
    if rs is None or rs.next_review_at is None:
        score = -item.sort_order + random.uniform(0, 10)
        return ("unseen", score)

    recency_penalty = 0.0
    if not all_mode and rs.last_reviewed_at:
        hours_since = (now - rs.last_reviewed_at).total_seconds() / 3600
        if hours_since < LESSON_CONFIG.anti_repeat_hard_hours:
            recency_penalty = -LESSON_CONFIG.anti_repeat_hard_penalty
        elif hours_since < LESSON_CONFIG.anti_repeat_soft_hours:
            recency_penalty = -LESSON_CONFIG.anti_repeat_soft_penalty

    if rs.status == "review":
        score = (2.5 - rs.ease_factor) * LESSON_CONFIG.learning_ease_weight
        if rs.next_review_at <= now:
            score += LESSON_CONFIG.learning_overdue_bonus
        score += random.uniform(0, 20) + recency_penalty
        return ("remediation", score)

    if rs.next_review_at <= now:
        overdue_hours = (now - rs.next_review_at).total_seconds() / 3600
        score = min(LESSON_CONFIG.due_overdue_max_score, overdue_hours * LESSON_CONFIG.due_overdue_hours_weight)
        score += (2.5 - rs.ease_factor) * LESSON_CONFIG.due_ease_weight
        score += random.uniform(0, 20) + recency_penalty
        return ("due", score)

    days_until = (rs.next_review_at - now).total_seconds() / 86400
    score = -days_until
    score += (2.5 - rs.ease_factor) * LESSON_CONFIG.not_due_ease_weight
    score += random.uniform(0, 10) + recency_penalty
    return ("not_due", score)


def _build_from_items(
    db: Session,
    child_id: int,
    items: list[Item],
    question_count: int,
    *,
    log_label: str = "pkg=?",
) -> list[Item]:
    """Shared item selection: classify, budget, score, return ordered list."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    item_ids = [item.id for item in items]
    reviews = (
        db.query(ReviewState)
        .filter(
            ReviewState.child_id == child_id,
            ReviewState.item_id.in_(item_ids),
        )
        .all()
    )
    review_map = {r.item_id: r for r in reviews}

    count = min(question_count, len(items))
    all_mode = question_count >= 999

    # Classify into buckets
    buckets: dict[str, list[tuple[float, Item]]] = {
        "remediation": [],
        "due": [],
        "unseen": [],
        "not_due": [],
    }
    for item in items:
        rs = review_map.get(item.id)
        category, score = _classify_and_score(item, rs, now, all_mode)
        buckets[category].append((score, item))

    for cat in buckets:
        buckets[cat].sort(key=lambda x: x[0], reverse=True)

    # Mode 999: return everything ordered
    if all_mode:
        result: list[Item] = []
        for cat in ["remediation", "due", "unseen", "not_due"]:
            result.extend(item for _, item in buckets[cat])
        return result

    # Budget allocation
    review_max, new_target, filler_target = _get_budget(count)

    remediation_items = [it for _, it in buckets["remediation"]]
    due_items = [it for _, it in buckets["due"]]
    review_pool = remediation_items + due_items
    unseen_pool = [it for _, it in buckets["unseen"]]
    filler_pool = [it for _, it in buckets["not_due"]]

    # Phase 1: fill by targets
    review_selected = review_pool[:review_max]
    unseen_selected = unseen_pool[:new_target]
    filler_selected = filler_pool[:filler_target]

    review_used = len(review_selected)
    unseen_used = len(unseen_selected)
    filler_used = len(filler_selected)

    # Phase 2: redistribute unused slots
    remaining = count - review_used - unseen_used - filler_used
    if remaining > 0:
        extra = unseen_pool[unseen_used : unseen_used + remaining]
        unseen_selected.extend(extra)
        unseen_used += len(extra)
        remaining -= len(extra)
    if remaining > 0:
        extra = filler_pool[filler_used : filler_used + remaining]
        filler_selected.extend(extra)
        filler_used += len(extra)
        remaining -= len(extra)
    if remaining > 0:
        extra = review_pool[review_used : review_used + remaining]
        review_selected.extend(extra)
        review_used += len(extra)

    result = review_selected + unseen_selected + filler_selected

    # Log actual selected counts + pool sizes
    selected_remediation = sum(1 for it in review_selected if it in remediation_items)
    selected_due = review_used - selected_remediation
    logger.info(
        "lesson_mix child=%d %s "
        "selected: remediation=%d due=%d unseen=%d not_due=%d total=%d | "
        "pools: remediation=%d due=%d unseen=%d not_due=%d",
        child_id,
        log_label,
        selected_remediation,
        selected_due,
        unseen_used,
        filler_used,
        len(result),
        len(buckets["remediation"]),
        len(buckets["due"]),
        len(buckets["unseen"]),
        len(buckets["not_due"]),
    )

    return result


def build_lesson_item_sequence(
    db: Session, child_id: int, package_id: int, question_count: int
) -> list[Item]:
    """Select and order items for a lesson from a single package.

    Uses budget-based allocation to balance review, new, and filler
    items. Items are scored by spaced repetition state and anti-repeat
    penalties.

    Args:
        db: Database session.
        child_id: ID of the child.
        package_id: ID of the package to select items from.
        question_count: Desired lesson size. Use 999 to return all items.

    Returns:
        Ordered list of Items for the lesson.
    """
    items = db.query(Item).filter(Item.package_id == package_id).all()
    if not items:
        return []
    return _build_from_items(
        db, child_id, items, question_count, log_label=f"pkg={package_id}"
    )


def build_subject_lesson_sequence(
    db: Session, child_id: int, subject: str, question_count: int,
    grade: int | None = None,
) -> list[Item]:
    """Select and order items for a lesson from published packages of a subject+grade."""
    query = db.query(Package.id).filter(
        Package.subject == subject, Package.status == "published",
    )
    if grade is not None:
        query = query.filter(Package.grade == grade)
    else:
        query = query.filter(Package.grade.is_(None))
    pkg_ids = [p.id for p in query.all()]
    if not pkg_ids:
        return []
    items = db.query(Item).filter(Item.package_id.in_(pkg_ids)).all()
    if not items:
        return []
    label = f"subject={subject}" + (f",grade={grade}" if grade is not None else "")
    return _build_from_items(
        db, child_id, items, question_count, log_label=label,
    )


def start_lesson(
    db: Session, child_id: int, package_id: int, question_count: int,
    child_user: User | None = None,
) -> tuple[LearningSession, Item | None]:
    """Start a new lesson session.

    Closes any active sessions for the child, selects items via
    budget-based allocation, and resets the reward streak.

    Args:
        db: Database session.
        child_id: ID of the child starting the lesson.
        package_id: ID of the published package to draw items from.
        question_count: Desired number of questions.
        child_user: Optional User object; when provided, streak is reset.

    Returns:
        Tuple of (LearningSession, first Item) or (LearningSession, None)
        if the package has no items.

    Raises:
        ValueError: If the package is not found, not published, or empty.
    """
    package = db.query(Package).filter(Package.id == package_id).first()
    if not package or package.status != "published":
        raise ValueError("Balíček nenalezen nebo není publikován")

    items = db.query(Item).filter(Item.package_id == package_id).all()
    if not items:
        raise ValueError("Balíček nemá žádné otázky")

    selected = build_lesson_item_sequence(db, child_id, package_id, question_count)
    item_ids = [item.id for item in selected]

    # Close any active sessions for this child
    db.query(LearningSession).filter(
        LearningSession.child_id == child_id,
        LearningSession.finished_at.is_(None),
    ).update({"finished_at": datetime.now(timezone.utc)})

    if child_user is not None:
        child_user.reward_streak = 0

    session = LearningSession(
        child_id=child_id,
        package_id=package_id,
        total_questions=len(selected),
        correct_count=0,
        item_ids=json.dumps(item_ids),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return session, selected[0] if selected else None


def start_subject_lesson(
    db: Session, child_id: int, subject: str, question_count: int,
    grade: int | None = None,
    child_user: User | None = None,
) -> tuple[LearningSession, Item | None]:
    """Start a new subject+grade review lesson across published packages."""
    query = db.query(Package).filter(
        Package.subject == subject, Package.status == "published",
    )
    if grade is not None:
        query = query.filter(Package.grade == grade)
    else:
        query = query.filter(Package.grade.is_(None))
    if query.count() == 0:
        raise ValueError("Pro tento předmět nejsou publikované balíčky")

    selected = build_subject_lesson_sequence(
        db, child_id, subject, question_count, grade=grade,
    )
    if not selected:
        raise ValueError("Pro tento předmět nejsou dostupné otázky")

    item_ids = [item.id for item in selected]

    # Close any active sessions for this child
    db.query(LearningSession).filter(
        LearningSession.child_id == child_id,
        LearningSession.finished_at.is_(None),
    ).update({"finished_at": datetime.now(timezone.utc)})

    if child_user is not None:
        child_user.reward_streak = 0

    session = LearningSession(
        child_id=child_id,
        package_id=None,
        subject=subject,
        grade=grade,
        total_questions=len(selected),
        correct_count=0,
        item_ids=json.dumps(item_ids),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return session, selected[0]


def submit_answer(
    db: Session,
    session: LearningSession,
    item_id: int,
    given_answer: str,
    response_time_ms: int | None,
    child_user: User | None = None,
) -> tuple[Feedback, RewardDelta | None]:
    """Submit an answer for a question in an active session.

    Checks correctness, records the answer, updates spaced repetition
    state, and processes reward progression. Auto-finishes the session
    when all questions have been answered.

    Args:
        db: Database session.
        session: The active LearningSession.
        item_id: ID of the item being answered.
        given_answer: JSON string of the child's answer.
        response_time_ms: Time taken to answer in milliseconds.
        child_user: Optional User object for reward tracking.

    Returns:
        Tuple of (Feedback, RewardDelta or None).

    Raises:
        ValueError: If the session is finished, item not found, or
            already answered the maximum allowed times.
    """
    if session.finished_at is not None:
        raise ValueError("Lekce je již ukončena")

    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise ValueError("Otázka nenalezena")

    # Guard: allow answering item_id as many times as it appears in item_ids
    item_ids_list = json.loads(session.item_ids)
    max_allowed = item_ids_list.count(item_id)
    existing_count = db.query(Answer).filter(
        Answer.session_id == session.id, Answer.item_id == item_id
    ).count()
    if existing_count >= max_allowed:
        raise ValueError("Tato otázka již byla zodpovězena")

    is_correct = check_answer(item, given_answer)
    correct_answer = get_correct_answer_display(item)

    answer = Answer(
        session_id=session.id,
        item_id=item_id,
        child_id=session.child_id,
        given_answer=given_answer,
        is_correct=is_correct,
        response_time_ms=response_time_ms,
    )
    db.add(answer)

    if is_correct:
        session.correct_count += 1

    # Check if lesson is complete
    # Note: autoflush includes the just-added answer in the count
    answers_count = (
        db.query(Answer).filter(Answer.session_id == session.id).count()
    )
    if answers_count >= session.total_questions:
        session.finished_at = datetime.now(timezone.utc)

    # Update spaced repetition state
    review = get_or_create_review(db, session.child_id, item_id)
    update_review(review, is_correct)

    # Determine token eligibility (below-grade package suppresses tokens)
    token_eligible = True
    pkg = item.package
    if (pkg and pkg.grade is not None
            and child_user is not None
            and child_user.grade is not None
            and pkg.grade < child_user.grade):
        token_eligible = False

    # Update reward state
    reward_delta = None
    if child_user is not None:
        reward_delta = process_answer_reward(
            child_user, is_correct, token_eligible=token_eligible,
        )

    db.commit()

    return (
        Feedback(
            is_correct=is_correct,
            correct_answer=correct_answer,
            explanation=item.explanation,
        ),
        reward_delta,
    )


def extend_session(
    db: Session, session: LearningSession,
) -> Item | None:
    """Extend a finished session with fresh questions.

    Selects a new batch of items, appends them to the session, and
    re-opens it. The child's reward streak is preserved across
    extensions.

    Args:
        db: Database session.
        session: The finished LearningSession to extend.

    Returns:
        The first Item of the new batch, or None if no items available.

    Raises:
        ValueError: If the session is not yet finished or the maximum
            number of extensions has been reached.
    """
    if session.finished_at is None:
        raise ValueError("Lekce ještě není dokončena")
    if session.extension_count >= LESSON_CONFIG.max_extensions:
        raise ValueError("Maximální počet rozšíření dosažen")

    # Fresh item selection (same as starting a new lesson — no exclusions)
    if session.package_id:
        selected = build_lesson_item_sequence(
            db, session.child_id, session.package_id, LESSON_CONFIG.extension_question_count
        )
    else:
        selected = build_subject_lesson_sequence(
            db, session.child_id, session.subject, LESSON_CONFIG.extension_question_count,
            grade=session.grade,
        )

    if not selected:
        raise ValueError("Žádné otázky k dispozici")

    # Append new items, re-open session
    new_ids = [it.id for it in selected]
    all_ids = json.loads(session.item_ids) + new_ids
    session.item_ids = json.dumps(all_ids)
    session.total_questions += len(selected)
    session.finished_at = None
    session.extension_count += 1

    db.commit()
    db.refresh(session)

    return selected[0]


def get_next_question_item(
    db: Session, session: LearningSession
) -> Item | None:
    """Get the next unanswered item in the session.

    An item can appear multiple times in item_ids (after extensions),
    so we track how many times each item has been answered vs. how many
    times it has appeared so far in the sequence.
    """
    item_ids = json.loads(session.item_ids)
    answers = db.query(Answer).filter(Answer.session_id == session.id).all()
    answer_counts: dict[int, int] = {}
    for a in answers:
        answer_counts[a.item_id] = answer_counts.get(a.item_id, 0) + 1

    seen: dict[int, int] = {}
    for item_id in item_ids:
        seen[item_id] = seen.get(item_id, 0) + 1
        if seen[item_id] > answer_counts.get(item_id, 0):
            return db.query(Item).filter(Item.id == item_id).first()
    return None
