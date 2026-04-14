import json
import os
from collections.abc import Generator
from pathlib import Path

os.environ["TESTING"] = "1"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.package import Item, Package
from app.models.user import User
from app.services.auth_service import create_token, hash_pin

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def client(db_session: Session) -> TestClient:
    def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def parent_user(db_session: Session) -> User:
    user = User(name="Rodič", role="parent", pin_hash=hash_pin("1234"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def child_user(db_session: Session, parent_user: User) -> User:
    child = User(
        name="Dítě", role="child", pin_hash=hash_pin("0000"),
        parent_id=parent_user.id,
    )
    db_session.add(child)
    db_session.commit()
    db_session.refresh(child)
    return child


@pytest.fixture
def auth_headers_parent(parent_user: User) -> dict:
    token = create_token(parent_user.id, "parent")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_child(child_user: User) -> dict:
    token = create_token(child_user.id, "child")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_package_json() -> str:
    return (FIXTURES / "valid_package_all_types.json").read_text()


@pytest.fixture
def published_package(db_session: Session, parent_user: User) -> Package:
    data = json.loads((FIXTURES / "valid_package_all_types.json").read_text())
    pkg = Package(
        name=data["metadata"]["name"],
        subject=data["metadata"].get("subject"),
        difficulty=data["metadata"].get("difficulty"),
        status="published",
        created_by=parent_user.id,
        raw_json=json.dumps(data),
    )
    db_session.add(pkg)
    db_session.flush()

    for i, item_data in enumerate(data["items"]):
        activity_type = item_data["type"]
        answer_fields = _extract_answer(activity_type, item_data)
        item = Item(
            package_id=pkg.id,
            sort_order=i,
            activity_type=activity_type,
            question=item_data["question"],
            answer_data=json.dumps(answer_fields),
            hint=item_data.get("hint"),
            explanation=item_data.get("explanation"),
            tags=json.dumps(item_data.get("tags", [])),
        )
        db_session.add(item)

    db_session.commit()
    db_session.refresh(pkg)
    return pkg


def _extract_answer(activity_type: str, item_data: dict) -> dict:
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
