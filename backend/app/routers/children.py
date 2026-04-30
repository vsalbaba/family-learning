"""Child account management and progress tracking."""

import json
import logging
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item, Package
from app.models.review import ReviewState
from app.models.session import Answer, LearningSession
from app.models.user import User
from app.routers.auth import require_parent
from app.schemas.user import ChildCreate, ChildResponse, ChildUpdate, UserResponse
from app.services.auth_service import hash_pin

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_pkg_name(db: Session, cache: dict[int, Package], package_id: int) -> str:
    """Get package name, loading from DB and caching if needed."""
    if package_id in cache:
        return cache[package_id].name
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if pkg:
        cache[package_id] = pkg
        return pkg.name
    return "?"


@router.get("", response_model=list[ChildResponse])
def list_children(
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """List all children belonging to the current parent."""
    children = db.query(User).filter(
        User.role == "child", User.parent_id == user.id
    ).all()
    return children


@router.post("", response_model=ChildResponse, status_code=status.HTTP_201_CREATED)
def create_child(
    req: ChildCreate,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Create a new child account under the current parent."""
    child = User(
        name=req.name,
        role="child",
        pin_hash=hash_pin(req.pin),
        pin_plain=req.pin,
        parent_id=user.id,
        avatar=req.avatar,
        grade=req.grade,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    logger.info("Child created: id=%d name=%s", child.id, child.name)
    return child


@router.put("/{child_id}", response_model=ChildResponse)
def update_child(
    child_id: int,
    req: ChildUpdate,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Update a child's profile fields."""
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == user.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Dítě nenalezeno")
    if req.name is not None:
        child.name = req.name
    if req.pin is not None:
        child.pin_hash = hash_pin(req.pin)
        child.pin_plain = req.pin
    if req.avatar is not None:
        child.avatar = req.avatar
    if req.game_tokens is not None:
        child.game_tokens = req.game_tokens
    if req.grade is not None:
        child.grade = req.grade if req.grade > 0 else None
    db.commit()
    db.refresh(child)
    return child


@router.delete("/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_child(
    child_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Delete a child account and all associated data."""
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == user.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Dítě nenalezeno")
    db.delete(child)
    db.commit()
    logger.info("Child deleted: id=%d", child_id)


@router.get("/{child_id}/progress")
def get_child_progress(
    child_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Return detailed progress statistics for a child."""
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == user.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Dítě nenalezeno")

    # All finished sessions for this child
    sessions = (
        db.query(LearningSession)
        .filter(
            LearningSession.child_id == child_id,
            LearningSession.finished_at.isnot(None),
        )
        .order_by(LearningSession.started_at.desc())
        .all()
    )

    # Split into package sessions and subject sessions
    pkg_sessions = [s for s in sessions if s.package_id is not None]
    subj_sessions = [s for s in sessions if s.package_id is None]

    # Per-package aggregation
    pkg_stats: dict[int, dict] = {}
    for s in pkg_sessions:
        if s.package_id not in pkg_stats:
            pkg_stats[s.package_id] = {
                "session_count": 0,
                "total_correct": 0,
                "total_questions": 0,
                "best_score_pct": 0.0,
                "last_played": s.started_at,
            }
        ps = pkg_stats[s.package_id]
        ps["session_count"] += 1
        ps["total_correct"] += s.correct_count
        ps["total_questions"] += s.total_questions
        pct = (s.correct_count / s.total_questions * 100) if s.total_questions else 0
        if pct > ps["best_score_pct"]:
            ps["best_score_pct"] = pct
        if s.started_at and (ps["last_played"] is None or s.started_at > ps["last_played"]):
            ps["last_played"] = s.started_at

    # Enrich with package names
    pkg_ids = list(pkg_stats.keys())
    packages = {
        p.id: p
        for p in db.query(Package).filter(Package.id.in_(pkg_ids)).all()
    } if pkg_ids else {}

    package_progress = []
    for pid, ps in pkg_stats.items():
        pkg = packages.get(pid)
        avg_pct = (ps["total_correct"] / ps["total_questions"] * 100) if ps["total_questions"] else 0
        package_progress.append({
            "package_id": pid,
            "package_name": pkg.name if pkg else "(smazaný)",
            "subject": pkg.subject_display or pkg.subject if pkg else None,
            "session_count": ps["session_count"],
            "avg_score_pct": round(avg_pct, 1),
            "best_score_pct": round(ps["best_score_pct"], 1),
            "last_played": ps["last_played"].isoformat() if ps["last_played"] else None,
        })
    package_progress.sort(key=lambda x: x["last_played"] or "", reverse=True)

    # Per-subject aggregation (subject-mode lessons)
    subj_stats: dict[str, dict] = {}
    for s in subj_sessions:
        key = s.subject or "(neznámý)"
        if key not in subj_stats:
            subj_stats[key] = {
                "session_count": 0,
                "total_correct": 0,
                "total_questions": 0,
                "best_score_pct": 0.0,
                "last_played": s.started_at,
            }
        ss = subj_stats[key]
        ss["session_count"] += 1
        ss["total_correct"] += s.correct_count
        ss["total_questions"] += s.total_questions
        pct = (s.correct_count / s.total_questions * 100) if s.total_questions else 0
        if pct > ss["best_score_pct"]:
            ss["best_score_pct"] = pct
        if s.started_at and (ss["last_played"] is None or s.started_at > ss["last_played"]):
            ss["last_played"] = s.started_at

    subject_progress = []
    for subj, ss in subj_stats.items():
        avg_pct = (ss["total_correct"] / ss["total_questions"] * 100) if ss["total_questions"] else 0
        subject_progress.append({
            "subject": subj,
            "session_count": ss["session_count"],
            "avg_score_pct": round(avg_pct, 1),
            "best_score_pct": round(ss["best_score_pct"], 1),
            "last_played": ss["last_played"].isoformat() if ss["last_played"] else None,
        })
    subject_progress.sort(key=lambda x: x["last_played"] or "", reverse=True)

    # Weakest questions: items answered wrong most often
    wrong_counts = (
        db.query(Answer.item_id, func.count(Answer.id).label("wrong_count"))
        .filter(Answer.child_id == child_id, Answer.is_correct == False)  # noqa: E712
        .group_by(Answer.item_id)
        .order_by(func.count(Answer.id).desc())
        .limit(10)
        .all()
    )
    total_per_item = dict(
        db.query(Answer.item_id, func.count(Answer.id))
        .filter(
            Answer.child_id == child_id,
            Answer.item_id.in_([r[0] for r in wrong_counts]),
        )
        .group_by(Answer.item_id)
        .all()
    ) if wrong_counts else {}

    item_ids = [r[0] for r in wrong_counts]
    items = {
        it.id: it
        for it in db.query(Item).filter(Item.id.in_(item_ids)).all()
    } if item_ids else {}

    # Fetch wrong answers for weak questions
    wrong_answers_by_item: dict[int, list[str]] = {}
    if item_ids:
        wrong_answer_rows = (
            db.query(Answer.item_id, Answer.given_answer)
            .filter(
                Answer.child_id == child_id,
                Answer.is_correct == False,  # noqa: E712
                Answer.item_id.in_(item_ids),
            )
            .order_by(Answer.answered_at.desc())
            .all()
        )
        for row_item_id, given_answer in wrong_answer_rows:
            wrong_answers_by_item.setdefault(row_item_id, []).append(given_answer)

    weak_questions = []
    for item_id, wrong_count in wrong_counts:
        item = items.get(item_id)
        total = total_per_item.get(item_id, wrong_count)
        weak_questions.append({
            "item_id": item_id,
            "question": item.question if item else "(smazaná)",
            "activity_type": item.activity_type if item else "unknown",
            "correct_answer": item.answer_data if item else "{}",
            "package_name": (
                _get_pkg_name(db, packages, item.package_id)
                if item else "(smazaný)"
            ),
            "wrong_count": wrong_count,
            "total_attempts": total,
            "error_rate_pct": round(wrong_count / total * 100, 1) if total else 0,
            "wrong_answers": wrong_answers_by_item.get(item_id, []),
        })

    # Overall summary — count from actual answers to avoid inflated totals
    # from auto-closed sessions where not all questions were answered.
    total_sessions = len(sessions)
    session_ids = [s.id for s in sessions]
    if session_ids:
        stats_row = (
            db.query(
                func.count(Answer.id),
                func.sum(case((Answer.is_correct == True, 1), else_=0)),  # noqa: E712
            )
            .filter(Answer.session_id.in_(session_ids))
            .one()
        )
        total_q = stats_row[0] or 0
        total_correct = stats_row[1] or 0
    else:
        total_q = 0
        total_correct = 0

    return {
        "child_id": child_id,
        "child_name": child.name,
        "total_sessions": total_sessions,
        "total_correct": total_correct,
        "total_questions": total_q,
        "overall_avg_pct": round(total_correct / total_q * 100, 1) if total_q else 0,
        "packages": package_progress,
        "subject_progress": subject_progress,
        "weak_questions": weak_questions,
    }


def _parse_json_safe(raw: str) -> object:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


def _build_progress_detail(
    db: Session,
    child_id: int,
    items: list[Item],
    pkg_cache: dict[int, Package],
    *,
    scope_type: str,
    package_id: int | None,
    subject: str | None,
    title: str,
) -> dict:
    item_ids = [it.id for it in items]

    # Per-item answer stats
    answer_stats: dict[int, tuple[int, int, int, str | None]] = {}
    if item_ids:
        rows = (
            db.query(
                Answer.item_id,
                func.count(Answer.id),
                func.sum(case((Answer.is_correct == True, 1), else_=0)),  # noqa: E712
                func.sum(case((Answer.is_correct == False, 1), else_=0)),  # noqa: E712
                func.max(Answer.answered_at),
            )
            .filter(Answer.child_id == child_id, Answer.item_id.in_(item_ids))
            .group_by(Answer.item_id)
            .all()
        )
        for iid, cnt, correct, wrong, last_at in rows:
            answer_stats[iid] = (
                cnt or 0,
                int(correct or 0),
                int(wrong or 0),
                last_at.isoformat() if last_at else None,
            )

    # ReviewState lookup
    review_map: dict[int, str] = {}
    if item_ids:
        rs_rows = (
            db.query(ReviewState.item_id, ReviewState.status)
            .filter(ReviewState.child_id == child_id, ReviewState.item_id.in_(item_ids))
            .all()
        )
        for iid, st in rs_rows:
            review_map[iid] = st

    # Build items list
    result_items = []
    for it in items:
        mastery = review_map.get(it.id, "unknown")
        cnt, correct, wrong, last_at = answer_stats.get(it.id, (0, 0, 0, None))
        pkg_name = _get_pkg_name(db, pkg_cache, it.package_id)
        result_items.append({
            "item_id": it.id,
            "package_id": it.package_id,
            "package_name": pkg_name,
            "question": it.question,
            "activity_type": it.activity_type,
            "answer_count": cnt,
            "correct_count": correct,
            "wrong_count": wrong,
            "mastery": mastery,
            "last_answered_at": last_at,
        })

    # Mastery counts over ALL items
    mastery_values = [review_map.get(it.id, "unknown") for it in items]
    mastery_counter = Counter(mastery_values)
    mastery_counts = {
        "unknown": mastery_counter.get("unknown", 0),
        "learning": mastery_counter.get("learning", 0),
        "known": mastery_counter.get("known", 0),
        "review": mastery_counter.get("review", 0),
    }

    # Total answers
    total_answers = sum(s[0] for s in answer_stats.values())

    # Recent wrong answers
    recent_wrong = []
    if item_ids:
        wrong_rows = (
            db.query(Answer)
            .filter(
                Answer.child_id == child_id,
                Answer.item_id.in_(item_ids),
                Answer.is_correct == False,  # noqa: E712
            )
            .order_by(Answer.answered_at.desc())
            .limit(10)
            .all()
        )
        item_map = {it.id: it for it in items}
        for ans in wrong_rows:
            it = item_map.get(ans.item_id)
            if not it:
                continue
            pkg_name = _get_pkg_name(db, pkg_cache, it.package_id)
            recent_wrong.append({
                "item_id": ans.item_id,
                "package_id": it.package_id,
                "package_name": pkg_name,
                "question": it.question,
                "activity_type": it.activity_type,
                "correct_answer_data": _parse_json_safe(it.answer_data),
                "given_answer_data": _parse_json_safe(ans.given_answer),
                "answered_at": ans.answered_at.isoformat() if ans.answered_at else None,
            })

    return {
        "scope_type": scope_type,
        "package_id": package_id,
        "subject": subject,
        "title": title,
        "total_answers": total_answers,
        "mastery_counts": mastery_counts,
        "items": result_items,
        "recent_wrong": recent_wrong,
    }


def _verify_child(db: Session, child_id: int, parent: User) -> User:
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == parent.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Dítě nenalezeno")
    return child


@router.get("/{child_id}/progress/package/{package_id}")
def get_package_progress_detail(
    child_id: int,
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    _verify_child(db, child_id, user)

    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")

    items = db.query(Item).filter(Item.package_id == package_id).all()
    pkg_cache: dict[int, Package] = {pkg.id: pkg}

    return _build_progress_detail(
        db, child_id, items, pkg_cache,
        scope_type="package",
        package_id=package_id,
        subject=None,
        title=pkg.name,
    )


@router.get("/{child_id}/progress/subject/{subject}")
def get_subject_progress_detail(
    child_id: int,
    subject: str,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    _verify_child(db, child_id, user)

    pkgs = db.query(Package).filter(Package.subject == subject).all()
    if not pkgs:
        all_pkgs = db.query(Package).filter(Package.subject.isnot(None)).all()
        pkgs = [p for p in all_pkgs if subject.startswith(p.subject)]
    if not pkgs:
        raise HTTPException(status_code=404, detail="Předmět nenalezen")

    pkg_cache: dict[int, Package] = {p.id: p for p in pkgs}
    pkg_ids = list(pkg_cache.keys())
    items = db.query(Item).filter(Item.package_id.in_(pkg_ids)).all()

    title = pkgs[0].subject_display or pkgs[0].subject or subject

    return _build_progress_detail(
        db, child_id, items, pkg_cache,
        scope_type="subject",
        package_id=None,
        subject=subject,
        title=title,
    )
