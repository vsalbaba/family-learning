import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item, Package
from app.models.user import User
from app.routers.auth import get_current_user, require_parent
from app.schemas.package import (
    PackageDetailResponse,
    PackageImportRequest,
    PackageImportResponse,
    PackageResponse,
    ItemResponse,
    ValidationResult as ValidationResultSchema,
    ValidationError as ValidationErrorSchema,
)
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


@router.post("/{package_id}/publish", response_model=PackageResponse)
def publish_package(
    package_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    pkg = db.query(Package).filter(Package.id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    if pkg.status not in ("draft", "ready"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot publish package in '{pkg.status}' status",
        )
    pkg.status = "published"
    pkg.published_at = datetime.now(timezone.utc)
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
    return {
        "metadata": {
            "name": pkg.name,
            "subject": pkg.subject,
            "difficulty": pkg.difficulty,
            "description": pkg.description,
        },
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
