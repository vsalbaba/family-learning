import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item, Package
from app.models.session import Answer
from app.models.user import User
from app.routers.auth import get_current_user, require_parent
from app.schemas.package import (
    ItemCreateRequest,
    ItemUpdateRequest,
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

router = APIRouter()


def _package_to_response(pkg: Package) -> PackageResponse:
    return PackageResponse(
        id=pkg.id,
        name=pkg.name,
        subject=pkg.subject,
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
        item_count=len(pkg.items),
    )


def _validation_to_schema(result) -> ValidationResultSchema:
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
    result = validate_package(raw_json)
    validation = _validation_to_schema(result)

    if not result.is_valid:
        return PackageImportResponse(package=None, validation=validation)

    data = result.parsed
    meta = data["metadata"]

    pkg = Package(
        name=meta["name"],
        subject=meta.get("subject"),
        difficulty=meta.get("difficulty"),
        description=meta.get("description"),
        tts_lang=meta.get("tts_lang"),
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

    return PackageImportResponse(
        package=_package_to_response(pkg),
        validation=validation,
    )


def _extract_answer_data(activity_type: str, item_data: dict) -> dict:
    """Extract the answer-related fields for storage in answer_data JSON."""
    if activity_type == "flashcard":
        return {"answer": item_data["answer"]}
    if activity_type == "multiple_choice":
        return {"options": item_data["options"], "correct": item_data["correct"]}
    if activity_type == "true_false":
        return {"correct": item_data["correct"]}
    if activity_type == "fill_in":
        result = {"accepted_answers": item_data["accepted_answers"]}
        if "case_sensitive" in item_data:
            result["case_sensitive"] = item_data["case_sensitive"]
        return result
    if activity_type == "matching":
        return {"pairs": item_data["pairs"]}
    if activity_type == "ordering":
        return {"correct_order": item_data["correct_order"]}
    if activity_type == "math_input":
        result = {"correct_value": item_data["correct_value"]}
        if "tolerance" in item_data:
            result["tolerance"] = item_data["tolerance"]
        if "unit" in item_data:
            result["unit"] = item_data["unit"]
        return result
    return {}


@router.post("/import", response_model=PackageImportResponse)
def import_package(
    req: PackageImportRequest,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    return _import_package(req.content, user, db)


@router.post("/import/file", response_model=PackageImportResponse)
async def import_package_file(
    file: UploadFile = File(...),
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    content = await file.read()
    raw_json = content.decode("utf-8")
    return _import_package(raw_json, user, db)


@router.get("", response_model=list[PackageResponse])
def list_packages(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Package)
    if user.role == "child":
        query = query.filter(Package.status == "published")
    packages = query.order_by(Package.created_at.desc()).all()
    return [_package_to_response(p) for p in packages]


@router.get("/{package_id}", response_model=PackageDetailResponse)
def get_package(
    package_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    if user.role == "child" and pkg.status != "published":
        raise HTTPException(status_code=403, detail="Package not available")

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
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    if req.name is not None:
        pkg.name = req.name
    if req.subject is not None:
        pkg.subject = req.subject
    if req.difficulty is not None:
        pkg.difficulty = req.difficulty
    if req.description is not None:
        pkg.description = req.description
    if req.tts_lang is not None:
        pkg.tts_lang = req.tts_lang if req.tts_lang != "" else None
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
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    pkg.status = "published"
    pkg.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(pkg)
    return _package_to_response(pkg)


@router.post("/{package_id}/unpublish", response_model=PackageResponse)
def unpublish_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
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
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
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
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    if pkg.status == "published":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a published package. Archive it first.",
        )
    db.delete(pkg)
    db.commit()


@router.get("/{package_id}/export")
def export_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    if pkg.raw_json:
        return json.loads(pkg.raw_json)
    # Reconstruct from DB
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
        "subject": pkg.subject,
        "difficulty": pkg.difficulty,
        "description": pkg.description,
    }
    if pkg.tts_lang:
        metadata["tts_lang"] = pkg.tts_lang
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
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
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
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.package_id == package_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
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
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    if req.activity_type not in VALID_ACTIVITY_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown activity type: {req.activity_type}")
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
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.package_id == package_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    # Delete any answers referencing this item first
    db.query(Answer).filter(Answer.item_id == item_id).delete()
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
        raise HTTPException(status_code=404, detail="Item not found")
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
        raise HTTPException(status_code=404, detail="Item not found")
    return {
        "item_id": item.id,
        "activity_type": item.activity_type,
        "question": item.question,
        "answer_data": get_child_answer_data(item),
        "hint": item.hint,
    }
