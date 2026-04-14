import json
import random
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.package import Item, Package
from app.models.session import Answer, LearningSession


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
        return json.dumps({"options": answer_data.get("options", [])})
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

    count = min(question_count, len(items), 10)
    selected = random.sample(items, count)
    item_ids = [item.id for item in selected]

    session = LearningSession(
        child_id=child_id,
        package_id=package_id,
        total_questions=count,
        correct_count=0,
        item_ids=json.dumps(item_ids),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return session, selected[0] if selected else None


def submit_answer(
    db: Session,
    session: LearningSession,
    item_id: int,
    given_answer: str,
    response_time_ms: int | None,
) -> Feedback:
    """Submit an answer for a question in an active session."""
    if session.finished_at is not None:
        raise ValueError("Session is already finished")

    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise ValueError("Item not found")

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

    db.commit()

    return Feedback(
        is_correct=is_correct,
        correct_answer=correct_answer,
        explanation=item.explanation,
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
