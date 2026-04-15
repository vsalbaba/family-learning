from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class LessonStartRequest(BaseModel):
    package_id: int | None = None
    subject: str | None = None
    question_count: int = Field(default=5, ge=1, le=999)

    @model_validator(mode="after")
    def exactly_one_source(self):
        if bool(self.package_id) == bool(self.subject):
            raise ValueError("Provide exactly one of package_id or subject")
        return self


class QuestionResponse(BaseModel):
    item_id: int
    question_index: int  # 0-based position in lesson
    total_questions: int
    activity_type: str
    question: str
    answer_data: str  # JSON — for child display (options, pairs, etc.)
    hint: str | None = None
    tts_lang: str | None = None


class AnswerRequest(BaseModel):
    item_id: int
    given_answer: str  # JSON string
    response_time_ms: int | None = None


class AnswerResponse(BaseModel):
    is_correct: bool
    correct_answer: str  # JSON — the correct answer for display
    given_answer: str  # JSON — the child's answer for display
    explanation: str | None = None
    next_question: QuestionResponse | None = None  # None when lesson is done


class LessonSummaryResponse(BaseModel):
    session_id: int
    total_questions: int
    correct_count: int
    score_percent: float
    started_at: datetime
    finished_at: datetime | None = None
    answers: list["AnswerDetail"]


class AnswerDetail(BaseModel):
    item_id: int
    question: str
    activity_type: str
    given_answer: str
    correct_answer: str
    is_correct: bool
    response_time_ms: int | None = None
