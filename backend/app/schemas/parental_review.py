import json
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.session import QuestionResponse, ParentalReviewInfo  # noqa: F401 – re-exported


class ParentalReviewCreate(BaseModel):
    child_id: int
    package_ids: list[int] | None = None
    subject_id: int | None = None
    grade: int | None = None
    target_credits: int = Field(default=20, ge=1, le=500)
    note: str | None = None

    @model_validator(mode="after")
    def exactly_one_scope(self):
        has_pkgs = bool(self.package_ids)
        has_subj = bool(self.subject_id)
        if has_pkgs and has_subj:
            raise ValueError("Provide package_ids or subject_id, not both")
        if not has_pkgs and not has_subj:
            raise ValueError("Provide package_ids or subject_id")
        return self


class ParentalReviewResponse(BaseModel):
    id: int
    parent_id: int
    child_id: int
    package_ids: list[int] | None = None
    subject_id: int | None = None
    grade: int | None = None
    target_credits: int
    current_credits: int
    status: str
    note: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None

    @field_validator("package_ids", mode="before")
    @classmethod
    def _parse_package_ids(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = {"from_attributes": True}


class NextBatchRequest(BaseModel):
    question_count: int = Field(default=10, ge=1, le=50)


class NextBatchResponse(BaseModel):
    session_id: int
    question: QuestionResponse
    review_progress: int
    review_target: int
    review_status: str
