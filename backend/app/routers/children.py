from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item, Package
from app.models.session import Answer, LearningSession
from app.models.user import User
from app.routers.auth import require_parent
from app.schemas.user import ChildCreate, ChildUpdate, UserResponse
from app.services.auth_service import hash_pin

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


@router.get("", response_model=list[UserResponse])
def list_children(
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    children = db.query(User).filter(
        User.role == "child", User.parent_id == user.id
    ).all()
    return children


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_child(
    req: ChildCreate,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    child = User(
        name=req.name,
        role="child",
        pin_hash=hash_pin(req.pin),
        parent_id=user.id,
        avatar=req.avatar,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    return child


@router.put("/{child_id}", response_model=UserResponse)
def update_child(
    child_id: int,
    req: ChildUpdate,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == user.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    if req.name is not None:
        child.name = req.name
    if req.pin is not None:
        child.pin_hash = hash_pin(req.pin)
    if req.avatar is not None:
        child.avatar = req.avatar
    db.commit()
    db.refresh(child)
    return child


@router.delete("/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_child(
    child_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == user.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    db.delete(child)
    db.commit()


@router.get("/{child_id}/progress")
def get_child_progress(
    child_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == user.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

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

    # Overall summary
    total_sessions = len(sessions)
    total_correct = sum(s.correct_count for s in sessions)
    total_q = sum(s.total_questions for s in sessions)

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
