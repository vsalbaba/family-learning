import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item
from app.models.session import Answer, LearningSession
from app.models.user import User
from app.routers.auth import require_child
from app.schemas.session import (
    AnswerDetail,
    AnswerRequest,
    AnswerResponse,
    LessonStartRequest,
    LessonSummaryResponse,
    QuestionResponse,
)
from app.services.lesson_engine import (
    get_child_answer_data,
    get_correct_answer_display,
    get_next_question_item,
    start_lesson,
    submit_answer,
)

router = APIRouter()


def _item_to_question(
    item: Item, index: int, total: int
) -> QuestionResponse:
    return QuestionResponse(
        item_id=item.id,
        question_index=index,
        total_questions=total,
        activity_type=item.activity_type,
        question=item.question,
        answer_data=get_child_answer_data(item),
        hint=item.hint,
    )


@router.post("/start")
def lesson_start(
    req: LessonStartRequest,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    try:
        session, first_item = start_lesson(
            db, user.id, req.package_id, req.question_count
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    question = None
    if first_item:
        question = _item_to_question(first_item, 0, session.total_questions)

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
    session = (
        db.query(LearningSession)
        .filter(LearningSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.child_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    try:
        feedback = submit_answer(
            db, session, req.item_id, req.given_answer, req.response_time_ms
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Get next question
    next_question = None
    if session.finished_at is None:
        next_item = get_next_question_item(db, session)
        if next_item:
            answered_count = (
                db.query(Answer)
                .filter(Answer.session_id == session.id)
                .count()
            )
            next_question = _item_to_question(
                next_item, answered_count, session.total_questions
            )

    return AnswerResponse(
        is_correct=feedback.is_correct,
        correct_answer=feedback.correct_answer,
        given_answer=req.given_answer,
        explanation=feedback.explanation,
        next_question=next_question,
    )


@router.get("/{session_id}/summary", response_model=LessonSummaryResponse)
def lesson_summary(
    session_id: int,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    session = (
        db.query(LearningSession)
        .filter(LearningSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.child_id != user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    if session.finished_at is None:
        raise HTTPException(status_code=400, detail="Lesson is not finished yet")

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
    )
