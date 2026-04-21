"""Package management: import, CRUD, merge, export, and validation."""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item, Package
from app.models.review import ReviewState
from app.models.session import Answer, LearningSession
from app.models.user import User
from app.routers.auth import get_current_user, require_parent
from app.schemas.package import (
    ItemCreateRequest,
    ItemUpdateRequest,
    MergeRequest,
    PackageDetailResponse,
    PackageImportRequest,
    PackageImportResponse,
    PackageResponse,
    PackageUpdateRequest,
    ItemResponse,
    ValidationResult as ValidationResultSchema,
    ValidationError as ValidationErrorSchema,
)
from app.schemas.session import AnswerRequest
from app.services.lesson_engine import check_answer, get_child_answer_data, get_correct_answer_display
from app.services.package_validator import validate_package

logger = logging.getLogger(__name__)

router = APIRouter()


def _normalize_subject(s: str | None) -> tuple[str | None, str | None]:
    """Return (normalized_key, display) for a subject value."""
    if not s or not s.strip():
        return None, None
    display = s.strip()
    return display.lower(), display


def _package_to_response(pkg: Package) -> PackageResponse:
    """Convert a Package ORM object to its API response model."""
    return PackageResponse(
        id=pkg.id,
        name=pkg.name,
        subject=pkg.subject,
        subject_display=pkg.subject_display,
        difficulty=pkg.difficulty,
        description=pkg.description,
        status=pkg.status,
        version=pkg.version,
        validation_warnings=pkg.validation_warnings,
        created_by=pkg.created_by,
        created_at=pkg.created_at,
        updated_at=pkg.updated_at,
        published_at=pkg.published_at,
        tts_lang=pkg.tts_lang,
        grade=pkg.grade,
        topic=pkg.topic,
        item_count=len(pkg.items),
    )


def _validation_to_schema(result) -> ValidationResultSchema:
    """Convert an internal ValidationResult to the API schema."""
    return ValidationResultSchema(
        is_valid=result.is_valid,
        hard_errors=[
            ValidationErrorSchema(
                code=e.code, message=e.message, path=e.path, severity=e.severity
            )
            for e in result.hard_errors
        ],
        soft_warnings=[
            ValidationErrorSchema(
                code=e.code, message=e.message, path=e.path, severity=e.severity
            )
            for e in result.soft_warnings
        ],
    )


def _import_package(
    raw_json: str, user: User, db: Session
) -> PackageImportResponse:
    """Validate and import a package from raw JSON."""
    result = validate_package(raw_json)
    validation = _validation_to_schema(result)

    if not result.is_valid:
        return PackageImportResponse(package=None, validation=validation)

    data = result.parsed
    meta = data["metadata"]

    subj_key, subj_display = _normalize_subject(meta.get("subject"))
    pkg = Package(
        name=meta["name"],
        subject=subj_key,
        subject_display=subj_display,
        difficulty=meta.get("difficulty"),
        description=meta.get("description"),
        tts_lang=meta.get("tts_lang"),
        grade=meta.get("grade"),
        topic=meta.get("topic"),
        status="draft",
        raw_json=raw_json,
        validation_warnings=json.dumps([
            {"code": w.code, "message": w.message, "path": w.path}
            for w in result.soft_warnings
        ]) if result.soft_warnings else None,
        created_by=user.id,
    )
    db.add(pkg)
    db.flush()

    for i, item_data in enumerate(data["items"]):
        activity_type = item_data["type"]
        answer_data = _extract_answer_data(activity_type, item_data)

        item = Item(
            package_id=pkg.id,
            sort_order=i,
            activity_type=activity_type,
            question=item_data["question"],
            answer_data=json.dumps(answer_data),
            hint=item_data.get("hint"),
            explanation=item_data.get("explanation"),
            tags=json.dumps(item_data.get("tags", [])),
        )
        db.add(item)

    db.commit()
    db.refresh(pkg)

    logger.info("Package imported: id=%d name=%s items=%d", pkg.id, pkg.name, len(data["items"]))

    return PackageImportResponse(
        package=_package_to_response(pkg),
        validation=validation,
    )


from app.services.item_parser import extract_answer_data as _extract_answer_data


@router.post("/import", response_model=PackageImportResponse)
def import_package(
    req: PackageImportRequest,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Import a package from a JSON string."""
    return _import_package(req.content, user, db)


@router.post("/import/file", response_model=PackageImportResponse)
async def import_package_file(
    file: UploadFile = File(...),
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Import a package from an uploaded JSON file."""
    content = await file.read()
    raw_json = content.decode("utf-8")
    return _import_package(raw_json, user, db)


@router.get("", response_model=list[PackageResponse])
def list_packages(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all packages, filtered by role."""
    query = db.query(Package)
    if user.role == "child":
        query = query.filter(Package.status == "published")
        packages = query.all()
        if user.grade is not None:
            def _sort_key(pkg):
                if pkg.grade is None:
                    return (1, "", pkg.name)
                if pkg.grade >= user.grade:
                    return (0, pkg.grade, pkg.name)
                return (2, -pkg.grade, pkg.name)
            packages.sort(key=_sort_key)
        else:
            packages.sort(key=lambda p: p.created_at or p.id, reverse=True)
    else:
        packages = query.order_by(Package.created_at.desc()).all()
    return [_package_to_response(p) for p in packages]


@router.get("/{package_id}", response_model=PackageDetailResponse)
def get_package(
    package_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve a single package with its items."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    if user.role == "child" and pkg.status != "published":
        raise HTTPException(status_code=403, detail="Balíček není dostupný")

    items = [ItemResponse.model_validate(item) for item in pkg.items]
    resp = PackageDetailResponse(
        **_package_to_response(pkg).model_dump(),
        items=items,
    )
    return resp


@router.put("/{package_id}", response_model=PackageResponse)
def update_package(
    package_id: int,
    req: PackageUpdateRequest,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Update package metadata fields."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    if req.name is not None:
        pkg.name = req.name
    if req.subject is not None:
        subj_key, subj_display = _normalize_subject(req.subject)
        pkg.subject = subj_key
        pkg.subject_display = subj_display
    if req.difficulty is not None:
        pkg.difficulty = req.difficulty
    if req.description is not None:
        pkg.description = req.description
    if req.tts_lang is not None:
        pkg.tts_lang = req.tts_lang if req.tts_lang != "" else None
    if req.grade is not None:
        pkg.grade = req.grade if req.grade > 0 else None
    if req.topic is not None:
        pkg.topic = req.topic.strip() if req.topic.strip() else None
    pkg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(pkg)
    return _package_to_response(pkg)


@router.post("/{package_id}/publish", response_model=PackageResponse)
def publish_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Publish a draft package to make it available to children."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    pkg.status = "published"
    pkg.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(pkg)
    logger.info("Package published: id=%d", package_id)
    return _package_to_response(pkg)


@router.post("/{package_id}/unpublish", response_model=PackageResponse)
def unpublish_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Revert a published package back to draft status."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    pkg.status = "draft"
    pkg.published_at = None
    db.commit()
    db.refresh(pkg)
    return _package_to_response(pkg)


@router.post("/{package_id}/archive", response_model=PackageResponse)
def archive_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Archive a package to hide it from children."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    pkg.status = "archived"
    db.commit()
    db.refresh(pkg)
    return _package_to_response(pkg)


@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Delete a non-published package."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    if pkg.status == "published":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nelze smazat publikovaný balíček. Nejprve jej archivujte.",
        )
    # Clean up records referencing this package's items
    item_ids = [item.id for item in pkg.items]
    if item_ids:
        db.query(Answer).filter(Answer.item_id.in_(item_ids)).delete()
        db.query(ReviewState).filter(ReviewState.item_id.in_(item_ids)).delete()
    # Unlink learning sessions (nullable FK)
    db.query(LearningSession).filter(LearningSession.package_id == package_id).update(
        {"package_id": None}
    )
    db.delete(pkg)
    db.commit()
    logger.info("Package deleted: id=%d", package_id)


@router.post("/{package_id}/merge", response_model=PackageDetailResponse)
def merge_packages(
    package_id: int,
    req: MergeRequest,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Merge source packages into the target package."""
    target = db.query(Package).filter(Package.id == package_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Cílový balíček nenalezen")

    if package_id in req.source_ids:
        raise HTTPException(
            status_code=400, detail="Cílový balíček nemůže být v seznamu zdrojových"
        )

    sources = []
    for sid in req.source_ids:
        src = db.query(Package).filter(Package.id == sid).first()
        if not src:
            raise HTTPException(
                status_code=404, detail=f"Zdrojový balíček {sid} nenalezen"
            )
        sources.append(src)

    # Find the next sort_order in the target package
    max_order = (
        db.query(Item.sort_order)
        .filter(Item.package_id == package_id)
        .order_by(Item.sort_order.desc())
        .first()
    )
    offset = (max_order[0] + 1) if max_order else 0

    try:
        for src in sorted(sources, key=lambda s: s.id):
            # Move items to target with updated sort_order
            src_items = (
                db.query(Item)
                .filter(Item.package_id == src.id)
                .order_by(Item.sort_order)
                .all()
            )
            for item in src_items:
                item.package_id = package_id
                item.sort_order = offset
                offset += 1

            # Redirect sessions to target
            db.query(LearningSession).filter(
                LearningSession.package_id == src.id
            ).update({LearningSession.package_id: package_id})

            # Delete the now-empty source package
            db.delete(src)

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Sloučení balíčků selhalo, změny byly vráceny zpět.",
        )

    logger.info("Packages merged: target=%d sources=%s", package_id, req.source_ids)
    db.refresh(target)

    items = [ItemResponse.model_validate(item) for item in target.items]
    return PackageDetailResponse(
        **_package_to_response(target).model_dump(),
        items=items,
    )


@router.get("/{package_id}/export")
def export_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Export a package as reconstructed JSON."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    # Always reconstruct from current DB state (raw_json may be stale)
    items_out = []
    for item in pkg.items:
        item_dict = {
            "type": item.activity_type,
            "question": item.question,
            **json.loads(item.answer_data),
        }
        if item.hint:
            item_dict["hint"] = item.hint
        if item.explanation:
            item_dict["explanation"] = item.explanation
        if item.tags:
            item_dict["tags"] = json.loads(item.tags)
        items_out.append(item_dict)
    metadata = {
        "name": pkg.name,
        "subject": pkg.subject_display or pkg.subject,
        "difficulty": pkg.difficulty,
        "description": pkg.description,
    }
    if pkg.tts_lang:
        metadata["tts_lang"] = pkg.tts_lang
    if pkg.grade is not None:
        metadata["grade"] = pkg.grade
    if pkg.topic:
        metadata["topic"] = pkg.topic
    return {
        "metadata": metadata,
        "items": items_out,
    }


@router.post("/{package_id}/validate", response_model=ValidationResultSchema)
def revalidate_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Re-validate a package from its current DB state."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    # Reconstruct JSON from DB items and re-validate
    export_data = export_package(package_id, user, db)
    raw = json.dumps(export_data)
    result = validate_package(raw)
    return _validation_to_schema(result)


VALID_ACTIVITY_TYPES = {
    "flashcard", "multiple_choice", "true_false",
    "fill_in", "matching", "ordering", "math_input",
}


@router.put("/{package_id}/items/{item_id}", response_model=ItemResponse)
def update_item(
    package_id: int,
    item_id: int,
    req: ItemUpdateRequest,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Update an existing item within a package."""
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.package_id == package_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Otázka nenalezena")
    if req.question is not None:
        item.question = req.question
    if req.answer_data is not None:
        item.answer_data = req.answer_data
    if req.hint is not None:
        item.hint = req.hint
    if req.explanation is not None:
        item.explanation = req.explanation
    if req.tags is not None:
        item.tags = req.tags
    db.commit()
    db.refresh(item)
    return item


@router.post("/{package_id}/items", response_model=ItemResponse, status_code=201)
def create_item(
    package_id: int,
    req: ItemCreateRequest,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Add a new item to a package."""
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Balíček nenalezen")
    if req.activity_type not in VALID_ACTIVITY_TYPES:
        raise HTTPException(status_code=422, detail=f"Neznámý typ aktivity: {req.activity_type}")
    max_order = (
        db.query(Item.sort_order)
        .filter(Item.package_id == package_id)
        .order_by(Item.sort_order.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 0
    item = Item(
        package_id=package_id,
        sort_order=next_order,
        activity_type=req.activity_type,
        question=req.question,
        answer_data=req.answer_data,
        hint=req.hint,
        explanation=req.explanation,
        tags=req.tags,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{package_id}/items/{item_id}", status_code=204)
def delete_item(
    package_id: int,
    item_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Delete an item and its associated answers."""
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.package_id == package_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Otázka nenalezena")
    # Delete any records referencing this item first
    db.query(Answer).filter(Answer.item_id == item_id).delete()
    db.query(ReviewState).filter(ReviewState.item_id == item_id).delete()
    db.delete(item)
    db.commit()


@router.post("/{package_id}/items/{item_id}/check")
def check_item_answer(
    package_id: int,
    item_id: int,
    req: AnswerRequest,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Check an answer without creating a session or saving anything."""
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.package_id == package_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Otázka nenalezena")
    is_correct = check_answer(item, req.given_answer)
    correct_answer = get_correct_answer_display(item)
    return {
        "is_correct": is_correct,
        "correct_answer": correct_answer,
        "given_answer": req.given_answer,
        "explanation": item.explanation,
    }


@router.get("/{package_id}/items/{item_id}/child-view")
def get_item_child_view(
    package_id: int,
    item_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    """Return the answer_data formatted for child display (no correct answers exposed)."""
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.package_id == package_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Otázka nenalezena")
    return {
        "item_id": item.id,
        "activity_type": item.activity_type,
        "question": item.question,
        "answer_data": get_child_answer_data(item),
        "hint": item.hint,
    }
