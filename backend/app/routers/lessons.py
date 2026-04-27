"""Lesson lifecycle: start, answer, extend, and summary."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item, Package
from app.models.session import Answer, LearningSession
from app.models.user import User
from app.routers.auth import require_child
from app.schemas.package import ImageData
from app.schemas.session import (
    AnswerDetail,
    AnswerRequest,
    AnswerResponse,
    LessonStartRequest,
    LessonSummaryResponse,
    QuestionResponse,
    RewardInfo,
)
from app.services.lesson_engine import (
    LESSON_CONFIG,
    extend_session,
    get_child_answer_data,
    get_correct_answer_display,
    get_next_question_item,
    start_lesson,
    start_subject_lesson,
    submit_answer,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _item_to_question(
    item: Item, index: int, total: int, tts_lang: str | None = None
) -> QuestionResponse:
    """Build a QuestionResponse from an Item for the child-facing API."""
    image = None
    if item.image_svg:
        image = ImageData(type="svg", svg=item.image_svg, alt=item.image_alt)
    return QuestionResponse(
        item_id=item.id,
        question_index=index,
        total_questions=total,
        activity_type=item.activity_type,
        question=item.question,
        answer_data=get_child_answer_data(item),
        hint=item.hint,
        tts_lang=tts_lang,
        image=image,
    )


@router.get("/subjects")
def list_subjects(
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    """Return distinct subject+grade combinations from published packages."""
    rows = (
        db.query(
            Package.subject,
            Package.grade,
            func.min(Package.subject_display).label("display"),
            func.count(Package.id).label("count"),
        )
        .filter(Package.status == "published", Package.subject.isnot(None))
        .group_by(Package.subject, Package.grade)
        .all()
    )
    result = []
    for subj, grade, display, cnt in rows:
        base_display = display or subj
        if grade is not None:
            full_display = f"{base_display}, {grade}. ročník"
        else:
            full_display = base_display
        result.append({
            "subject": subj,
            "grade": grade,
            "display": full_display,
            "package_count": cnt,
        })
    return result


@router.post("/start")
def lesson_start(
    req: LessonStartRequest,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    """Start a new lesson for the current child."""
    try:
        if req.package_id:
            session, first_item = start_lesson(
                db, user.id, req.package_id, req.question_count,
                child_user=user,
            )
        else:
            session, first_item = start_subject_lesson(
                db, user.id, req.subject, req.question_count,
                grade=req.grade,
                child_user=user,
            )
    except ValueError as e:
        msg = str(e)
        if "nejsou publikované" in msg or "nejsou dostupné" in msg:
            code = status.HTTP_404_NOT_FOUND
        else:
            code = status.HTTP_403_FORBIDDEN
        raise HTTPException(status_code=code, detail=msg)

    logger.info("Lesson started: session_id=%d child_id=%d", session.id, user.id)

    # Resolve tts_lang from the item's package (works for both modes)
    tts_lang = first_item.package.tts_lang if first_item and first_item.package else None

    question = None
    if first_item:
        question = _item_to_question(first_item, 0, session.total_questions, tts_lang)

    return {
        "session_id": session.id,
        "total_questions": session.total_questions,
        "question": question,
    }


@router.post("/{session_id}/answer", response_model=AnswerResponse)
def lesson_answer(
    session_id: int,
    req: AnswerRequest,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    """Submit an answer and receive feedback with the next question."""
    session = (
        db.query(LearningSession)
        .filter(LearningSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")
    if session.child_id != user.id:
        raise HTTPException(status_code=403, detail="Toto není tvoje lekce")

    try:
        feedback, reward_delta = submit_answer(
            db, session, req.item_id, req.given_answer, req.response_time_ms,
            child_user=user,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Get next question
    next_question = None
    if session.finished_at is None:
        next_item = get_next_question_item(db, session)
        if next_item:
            tts_lang = next_item.package.tts_lang if next_item.package else None
            answered_count = (
                db.query(Answer)
                .filter(Answer.session_id == session.id)
                .count()
            )
            next_question = _item_to_question(
                next_item, answered_count, session.total_questions, tts_lang
            )

    return AnswerResponse(
        is_correct=feedback.is_correct,
        correct_answer=feedback.correct_answer,
        given_answer=req.given_answer,
        explanation=feedback.explanation,
        next_question=next_question,
        reward=RewardInfo(**vars(reward_delta)) if reward_delta else None,
    )


@router.post("/{session_id}/extend")
def lesson_extend(
    session_id: int,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    """Extend a finished lesson with additional questions."""
    session = (
        db.query(LearningSession)
        .filter(LearningSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")
    if session.child_id != user.id:
        raise HTTPException(status_code=403, detail="Toto není tvoje lekce")

    try:
        first_item = extend_session(db, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info("Lesson extended: session_id=%d", session_id)

    tts_lang = first_item.package.tts_lang if first_item and first_item.package else None
    answered_count = (
        db.query(Answer).filter(Answer.session_id == session.id).count()
    )
    question = _item_to_question(
        first_item, answered_count, session.total_questions, tts_lang
    )

    return {
        "question": question,
        "total_questions": session.total_questions,
        "extension_count": session.extension_count,
    }


@router.get("/{session_id}/summary", response_model=LessonSummaryResponse)
def lesson_summary(
    session_id: int,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    """Return the summary of a completed lesson."""
    session = (
        db.query(LearningSession)
        .filter(LearningSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")
    if session.child_id != user.id:
        raise HTTPException(status_code=403, detail="Toto není tvoje lekce")
    if session.finished_at is None:
        raise HTTPException(status_code=400, detail="Lekce ještě není dokončena")

    answers = (
        db.query(Answer)
        .filter(Answer.session_id == session.id)
        .order_by(Answer.answered_at)
        .all()
    )

    details = []
    for ans in answers:
        item = db.query(Item).filter(Item.id == ans.item_id).first()
        details.append(
            AnswerDetail(
                item_id=ans.item_id,
                question=item.question if item else "",
                activity_type=item.activity_type if item else "",
                given_answer=ans.given_answer,
                correct_answer=get_correct_answer_display(item) if item else "{}",
                is_correct=ans.is_correct,
                response_time_ms=ans.response_time_ms,
            )
        )

    total = session.total_questions
    score = (session.correct_count / total * 100) if total > 0 else 0

    return LessonSummaryResponse(
        session_id=session.id,
        total_questions=total,
        correct_count=session.correct_count,
        score_percent=round(score, 1),
        started_at=session.started_at,
        finished_at=session.finished_at,
        answers=details,
        extension_count=session.extension_count,
        can_extend=session.extension_count < LESSON_CONFIG.max_extensions,
    )
