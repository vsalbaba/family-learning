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

# ── Tuning constants (iteration 1 defaults) ────────────────────
REVIEW_MAX_RATIO = 0.4
NEW_TARGET_RATIO = 0.4
ANTI_REPEAT_HARD_HOURS = 6
ANTI_REPEAT_SOFT_HOURS = 24
ANTI_REPEAT_HARD_PENALTY = 1000
ANTI_REPEAT_SOFT_PENALTY = 200
LEARNING_EASE_WEIGHT = 100
LEARNING_OVERDUE_BONUS = 50
DUE_OVERDUE_HOURS_WEIGHT = 2
DUE_OVERDUE_MAX_SCORE = 200
DUE_EASE_WEIGHT = 40
NOT_DUE_EASE_WEIGHT = 20

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
    review_max = round(count * REVIEW_MAX_RATIO)
    new_target = round(count * NEW_TARGET_RATIO)
    filler_target = count - review_max - new_target
    return (review_max, new_target, filler_target)


def _classify_and_score(
    item: Item, rs: ReviewState | None, now: datetime, all_mode: bool
) -> tuple[str, float]:
    """Return (category, score) for an item based on its review state."""
    if rs is None or rs.next_review_at is None:
        score = -item.sort_order + random.uniform(0, 10)
        return ("new", score)

    recency_penalty = 0.0
    if not all_mode and rs.last_reviewed_at:
        hours_since = (now - rs.last_reviewed_at).total_seconds() / 3600
        if hours_since < ANTI_REPEAT_HARD_HOURS:
            recency_penalty = -ANTI_REPEAT_HARD_PENALTY
        elif hours_since < ANTI_REPEAT_SOFT_HOURS:
            recency_penalty = -ANTI_REPEAT_SOFT_PENALTY

    if rs.status == "learning":
        score = (2.5 - rs.ease_factor) * LEARNING_EASE_WEIGHT
        if rs.next_review_at <= now:
            score += LEARNING_OVERDUE_BONUS
        score += random.uniform(0, 20) + recency_penalty
        return ("learning", score)

    if rs.next_review_at <= now:
        overdue_hours = (now - rs.next_review_at).total_seconds() / 3600
        score = min(DUE_OVERDUE_MAX_SCORE, overdue_hours * DUE_OVERDUE_HOURS_WEIGHT)
        score += (2.5 - rs.ease_factor) * DUE_EASE_WEIGHT
        score += random.uniform(0, 20) + recency_penalty
        return ("due", score)

    days_until = (rs.next_review_at - now).total_seconds() / 86400
    score = -days_until
    score += (2.5 - rs.ease_factor) * NOT_DUE_EASE_WEIGHT
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
        "learning": [],
        "due": [],
        "new": [],
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
        for cat in ["learning", "due", "new", "not_due"]:
            result.extend(item for _, item in buckets[cat])
        return result

    # Budget allocation
    review_max, new_target, filler_target = _get_budget(count)

    learning_items = [it for _, it in buckets["learning"]]
    due_items = [it for _, it in buckets["due"]]
    review_pool = learning_items + due_items
    new_pool = [it for _, it in buckets["new"]]
    filler_pool = [it for _, it in buckets["not_due"]]

    # Phase 1: fill by targets
    review_selected = review_pool[:review_max]
    new_selected = new_pool[:new_target]
    filler_selected = filler_pool[:filler_target]

    review_used = len(review_selected)
    new_used = len(new_selected)
    filler_used = len(filler_selected)

    # Phase 2: redistribute unused slots
    remaining = count - review_used - new_used - filler_used
    if remaining > 0:
        extra = new_pool[new_used : new_used + remaining]
        new_selected.extend(extra)
        new_used += len(extra)
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

    result = review_selected + new_selected + filler_selected

    # Log actual selected counts + pool sizes
    selected_learning = sum(1 for it in review_selected if it in learning_items)
    selected_due = review_used - selected_learning
    logger.info(
        "lesson_mix child=%d %s "
        "selected: learning=%d due=%d new=%d not_due=%d total=%d | "
        "pools: learning=%d due=%d new=%d not_due=%d",
        child_id,
        log_label,
        selected_learning,
        selected_due,
        new_used,
        filler_used,
        len(result),
        len(buckets["learning"]),
        len(buckets["due"]),
        len(buckets["new"]),
        len(buckets["not_due"]),
    )

    return result


def build_lesson_item_sequence(
    db: Session, child_id: int, package_id: int, question_count: int
) -> list[Item]:
    """Select and order items for a lesson from a single package."""
    items = db.query(Item).filter(Item.package_id == package_id).all()
    if not items:
        return []
    return _build_from_items(
        db, child_id, items, question_count, log_label=f"pkg={package_id}"
    )


def build_subject_lesson_sequence(
    db: Session, child_id: int, subject: str, question_count: int
) -> list[Item]:
    """Select and order items for a lesson from all published packages of a subject."""
    pkg_ids = [
        p.id
        for p in db.query(Package.id)
        .filter(Package.subject == subject, Package.status == "published")
        .all()
    ]
    if not pkg_ids:
        return []
    items = db.query(Item).filter(Item.package_id.in_(pkg_ids)).all()
    if not items:
        return []
    return _build_from_items(
        db, child_id, items, question_count, log_label=f"subject={subject}"
    )


def start_lesson(
    db: Session, child_id: int, package_id: int, question_count: int
) -> tuple[LearningSession, Item | None]:
    """Start a new lesson session. Returns (session, first_question_item)."""
    package = db.query(Package).filter(Package.id == package_id).first()
    if not package or package.status != "published":
        raise ValueError("Package not found or not published")

    items = db.query(Item).filter(Item.package_id == package_id).all()
    if not items:
        raise ValueError("Package has no items")

    selected = build_lesson_item_sequence(db, child_id, package_id, question_count)
    item_ids = [item.id for item in selected]

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
    db: Session, child_id: int, subject: str, question_count: int
) -> tuple[LearningSession, Item | None]:
    """Start a new subject-review lesson across all published packages of a subject."""
    pkg_count = (
        db.query(Package)
        .filter(Package.subject == subject, Package.status == "published")
        .count()
    )
    if pkg_count == 0:
        raise ValueError("No published packages for this subject")

    selected = build_subject_lesson_sequence(db, child_id, subject, question_count)
    if not selected:
        raise ValueError("No usable items for this subject")

    item_ids = [item.id for item in selected]
    session = LearningSession(
        child_id=child_id,
        package_id=None,
        subject=subject,
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
    """Submit an answer for a question in an active session."""
    if session.finished_at is not None:
        raise ValueError("Session is already finished")

    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise ValueError("Item not found")

    # Guard against duplicate answers for the same item
    existing = db.query(Answer).filter(
        Answer.session_id == session.id, Answer.item_id == item_id
    ).first()
    if existing:
        raise ValueError("Already answered this question")

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

    # Update reward state
    reward_delta = None
    if child_user is not None:
        reward_delta = process_answer_reward(child_user, is_correct)

    db.commit()

    return (
        Feedback(
            is_correct=is_correct,
            correct_answer=correct_answer,
            explanation=item.explanation,
        ),
        reward_delta,
    )


def get_next_question_item(
    db: Session, session: LearningSession
) -> Item | None:
    """Get the next unanswered item in the session."""
    item_ids = json.loads(session.item_ids)
    answered_ids = {
        a.item_id
        for a in db.query(Answer).filter(Answer.session_id == session.id).all()
    }
    for item_id in item_ids:
        if item_id not in answered_ids:
            return db.query(Item).filter(Item.id == item_id).first()
    return None
