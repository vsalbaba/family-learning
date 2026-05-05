"""Parental review endpoints: create, list, detail, cancel, and next-batch."""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item, Package
from app.models.parental_review import ParentalReview
from app.models.session import Answer, LearningSession
from app.models.subject import Subject
from app.models.user import User
from app.routers.auth import require_child, require_parent, get_current_user
from app.schemas.parental_review import (
    NextBatchRequest,
    NextBatchResponse,
    ParentalReviewCreate,
    ParentalReviewResponse,
)
from app.services.lesson_engine import (
    build_lesson_item_sequence,
    build_question_response,
    build_subject_lesson_sequence,
    get_next_question_item,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Parent endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=ParentalReviewResponse, status_code=201)
def create_review(
    req: ParentalReviewCreate,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Create a new parental review assignment for a child."""
    child = db.query(User).filter(User.id == req.child_id, User.role == "child").first()
    if not child or child.parent_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dítě nenalezeno",
        )

    if req.package_id:
        pkg = db.query(Package).filter(Package.id == req.package_id).first()
        if not pkg or pkg.status != "published":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Balíček nenalezen nebo není publikován",
            )
    else:
        subj = db.query(Subject).filter(Subject.id == req.subject_id).first()
        if not subj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Předmět nenalezen",
            )

    review = ParentalReview(
        parent_id=user.id,
        child_id=req.child_id,
        package_id=req.package_id,
        subject_id=req.subject_id,
        grade=req.grade,
        target_credits=req.target_credits,
        note=req.note,
        status="active",
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    logger.info(
        "ParentalReview created: id=%d parent=%d child=%d",
        review.id, user.id, req.child_id,
    )
    return review


@router.get("", response_model=list[ParentalReviewResponse])
def list_reviews(
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """List all parental review assignments created by this parent."""
    reviews = (
        db.query(ParentalReview)
        .filter(ParentalReview.parent_id == user.id)
        .order_by(ParentalReview.created_at.desc())
        .all()
    )
    return reviews


@router.get("/{review_id}", response_model=ParentalReviewResponse)
def get_review(
    review_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get details of a specific parental review (parent or the assigned child)."""
    review = db.query(ParentalReview).filter(ParentalReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Opakování nenalezeno")
    if user.role == "parent" and review.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Přístup odepřen")
    if user.role == "child" and review.child_id != user.id:
        raise HTTPException(status_code=403, detail="Přístup odepřen")
    return review


@router.patch("/{review_id}/cancel", response_model=ParentalReviewResponse)
def cancel_review(
    review_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Cancel an active parental review assignment.

    Also closes any open sessions linked to this review so the child
    cannot continue submitting answers against it.
    """
    review = db.query(ParentalReview).filter(ParentalReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Opakování nenalezeno")
    if review.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Přístup odepřen")
    if review.status != "active":
        raise HTTPException(
            status_code=400,
            detail="Opakování není aktivní",
        )
    now = datetime.now(timezone.utc)
    review.status = "cancelled"
    review.cancelled_at = now

    # Close any open sessions tied to this review
    db.query(LearningSession).filter(
        LearningSession.parental_review_id == review_id,
        LearningSession.finished_at.is_(None),
    ).update({"finished_at": now}, synchronize_session="fetch")

    db.commit()
    db.refresh(review)
    return review


# ---------------------------------------------------------------------------
# Child endpoint – the key endpoint
# ---------------------------------------------------------------------------

@router.post("/{review_id}/next-batch", response_model=NextBatchResponse)
def next_batch(
    review_id: int,
    req: NextBatchRequest,
    user: User = Depends(require_child),
    db: Session = Depends(get_db),
):
    """Return session_id and first question for the next question batch.

    If an unfinished session tied to this review already exists, it is
    reused. Otherwise a fresh batch is created, closing any unrelated
    open sessions first.

    ``question_count`` is read from the JSON request body (default 10).
    """
    review = db.query(ParentalReview).filter(ParentalReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Opakování nenalezeno")
    if review.child_id != user.id:
        raise HTTPException(status_code=403, detail="Přístup odepřen")
    if review.status != "active":
        detail = (
            "Opakování je splněno" if review.status == "completed"
            else "Opakování bylo zrušeno"
        )
        raise HTTPException(status_code=400, detail=detail)

    # Check for an existing unfinished session for this review
    existing_session = (
        db.query(LearningSession)
        .filter(
            LearningSession.child_id == user.id,
            LearningSession.parental_review_id == review_id,
            LearningSession.finished_at.is_(None),
        )
        .first()
    )

    if existing_session:
        session = existing_session
        next_item = get_next_question_item(db, session)
        if next_item is None:
            # Session has no unanswered questions — treat as finished and fall through
            session.finished_at = datetime.now(timezone.utc)
            db.commit()
            existing_session = None

    if not existing_session:
        if review.package_id:
            pkg = db.query(Package).filter(Package.id == review.package_id).first()
            if not pkg or pkg.status != "published":
                raise HTTPException(status_code=400, detail="Balíček není dostupný")
            selected = build_lesson_item_sequence(
                db, user.id, review.package_id, req.question_count
            )
        else:
            selected = build_subject_lesson_sequence(
                db, user.id, review.subject_id, req.question_count, grade=review.grade
            )

        if not selected:
            raise HTTPException(
                status_code=400,
                detail="Žádné otázky k dispozici",
            )

        # Close unrelated open sessions for this child
        db.query(LearningSession).filter(
            LearningSession.child_id == user.id,
            LearningSession.finished_at.is_(None),
            or_(
                LearningSession.parental_review_id.is_(None),
                LearningSession.parental_review_id != review_id,
            ),
        ).update({"finished_at": datetime.now(timezone.utc)}, synchronize_session="fetch")

        item_ids = [item.id for item in selected]
        session = LearningSession(
            child_id=user.id,
            package_id=review.package_id,
            subject_id=review.subject_id,
            grade=review.grade,
            total_questions=len(selected),
            correct_count=0,
            item_ids=json.dumps(item_ids),
            parental_review_id=review_id,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        next_item = selected[0]

    answered_count = (
        db.query(Answer).filter(Answer.session_id == session.id).count()
    )
    tts_lang = next_item.package.tts_lang if next_item.package else None
    question = build_question_response(next_item, answered_count, session.total_questions, tts_lang)

    return NextBatchResponse(
        session_id=session.id,
        question=question,
        review_progress=review.current_credits,
        review_target=review.target_credits,
        review_status=review.status,
    )


# ---------------------------------------------------------------------------
# Child-scoped list endpoint (also accessible by parent)
# ---------------------------------------------------------------------------

@router.get("/child/{child_id}", response_model=list[ParentalReviewResponse])
def list_child_reviews(
    child_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List parental reviews for a specific child (active ones first).

    Accessible by the child themselves or by the parent of that child.
    """
    child = db.query(User).filter(User.id == child_id, User.role == "child").first()
    if not child:
        raise HTTPException(status_code=404, detail="Dítě nenalezeno")

    if user.role == "child" and user.id != child_id:
        raise HTTPException(status_code=403, detail="Přístup odepřen")
    if user.role == "parent" and child.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Přístup odepřen")

    reviews = (
        db.query(ParentalReview)
        .filter(ParentalReview.child_id == child_id)
        .order_by(ParentalReview.created_at.desc())
        .all()
    )
    return reviews
