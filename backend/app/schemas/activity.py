"""Schemas for daily activity ticker endpoints."""

from pydantic import BaseModel


class SubjectActivity(BaseModel):
    subject_id: int
    subject_slug: str
    subject_name: str
    task_count: int


class DailyActivityResponse(BaseModel):
    child_id: int
    date: str
    total_tasks: int
    subjects: list[SubjectActivity]


class PackageActivity(BaseModel):
    package_id: int
    package_name: str
    task_count: int
    correct_count: int
    wrong_count: int


class SubjectDailyDetailResponse(BaseModel):
    child_id: int
    date: str
    subject_id: int
    subject_slug: str
    subject_name: str
    total_tasks: int
    packages: list[PackageActivity]
