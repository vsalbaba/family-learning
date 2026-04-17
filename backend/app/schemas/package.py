from datetime import datetime

from pydantic import BaseModel


class ValidationError(BaseModel):
    code: str
    message: str
    path: str
    severity: str  # "error" or "warning"


class ValidationResult(BaseModel):
    is_valid: bool
    hard_errors: list[ValidationError]
    soft_warnings: list[ValidationError]


class ItemResponse(BaseModel):
    id: int
    sort_order: int
    activity_type: str
    question: str
    answer_data: str  # JSON string
    hint: str | None = None
    explanation: str | None = None
    tags: str | None = None

    model_config = {"from_attributes": True}


class PackageResponse(BaseModel):
    id: int
    name: str
    subject: str | None = None
    subject_display: str | None = None
    difficulty: str | None = None
    description: str | None = None
    status: str
    version: int
    validation_warnings: str | None = None
    created_by: int
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None = None
    tts_lang: str | None = None
    item_count: int = 0

    model_config = {"from_attributes": True}


class PackageDetailResponse(PackageResponse):
    items: list[ItemResponse] = []


class PackageUpdateRequest(BaseModel):
    name: str | None = None
    subject: str | None = None
    difficulty: str | None = None
    description: str | None = None
    tts_lang: str | None = None


class ItemUpdateRequest(BaseModel):
    question: str | None = None
    answer_data: str | None = None  # JSON string
    hint: str | None = None
    explanation: str | None = None
    tags: str | None = None


class ItemCreateRequest(BaseModel):
    activity_type: str
    question: str
    answer_data: str  # JSON string
    hint: str | None = None
    explanation: str | None = None
    tags: str | None = None


class PackageImportRequest(BaseModel):
    content: str  # raw JSON string


class PackageImportResponse(BaseModel):
    package: PackageResponse | None = None
    validation: ValidationResult


class MergeRequest(BaseModel):
    source_ids: list[int]
