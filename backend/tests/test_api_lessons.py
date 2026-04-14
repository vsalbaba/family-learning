import json

from app.services.auth_service import create_token, hash_pin
from app.models.user import User


class TestStartLesson:
    def test_start_lesson(self, client, auth_headers_child, published_package):
        resp = client.post(
            "/api/lessons/start",
            json={"package_id": published_package.id, "question_count": 3},
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data
        assert data["total_questions"] == 3
        assert data["question"] is not None

    def test_start_lesson_child_only(
        self, client, auth_headers_parent, published_package
    ):
        resp = client.post(
            "/api/lessons/start",
            json={"package_id": published_package.id, "question_count": 3},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 403


class TestAnswer:
    def _start_and_get_question(self, client, headers, package_id, count=1):
        resp = client.post(
            "/api/lessons/start",
            json={"package_id": package_id, "question_count": count},
            headers=headers,
        )
        data = resp.json()
        return data["session_id"], data["question"]

    def test_answer_question_correct(
        self, client, auth_headers_child, published_package
    ):
        session_id, question = self._start_and_get_question(
            client, auth_headers_child, published_package.id, 1
        )
        # Build a generic correct answer based on type
        answer = self._make_answer(question, correct=True)
        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={
                "item_id": question["item_id"],
                "given_answer": json.dumps(answer),
            },
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "is_correct" in data
        assert "correct_answer" in data

    def test_answer_question_wrong(
        self, client, auth_headers_child, published_package
    ):
        session_id, question = self._start_and_get_question(
            client, auth_headers_child, published_package.id, 1
        )
        answer = self._make_answer(question, correct=False)
        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={
                "item_id": question["item_id"],
                "given_answer": json.dumps(answer),
            },
            headers=auth_headers_child,
        )
        assert resp.status_code == 200

    def test_wrong_session_id(self, client, auth_headers_child):
        resp = client.post(
            "/api/lessons/99999/answer",
            json={"item_id": 1, "given_answer": "{}"},
            headers=auth_headers_child,
        )
        assert resp.status_code == 404

    def test_other_childs_session(
        self, client, db_session, auth_headers_child, published_package, parent_user
    ):
        # Create a second child
        child2 = User(
            name="Child2", role="child", pin_hash=hash_pin("1111"),
            parent_id=parent_user.id,
        )
        db_session.add(child2)
        db_session.commit()
        db_session.refresh(child2)
        token2 = create_token(child2.id, "child")
        headers2 = {"Authorization": f"Bearer {token2}"}

        # Start lesson as child2
        resp = client.post(
            "/api/lessons/start",
            json={"package_id": published_package.id, "question_count": 1},
            headers=headers2,
        )
        session_id = resp.json()["session_id"]

        # Try to answer as child1
        resp = client.post(
            f"/api/lessons/{session_id}/answer",
            json={"item_id": 1, "given_answer": "{}"},
            headers=auth_headers_child,
        )
        assert resp.status_code == 403

    def _make_answer(self, question, correct=True):
        """Build an answer dict based on the question's activity type."""
        activity = question["activity_type"]
        if activity == "flashcard":
            return {"knew": correct}
        if activity == "multiple_choice":
            answer_data = json.loads(question["answer_data"])
            options = answer_data.get("options", [])
            if correct:
                return {"selected": 0}  # We don't know the correct index here
            return {"selected": len(options) - 1 if options else 0}
        if activity == "true_false":
            return {"answer": correct}
        if activity == "fill_in":
            return {"text": "correct_placeholder" if correct else "wrong"}
        if activity == "matching":
            return {"pairs": []}
        if activity == "ordering":
            return {"order": []}
        if activity == "math_input":
            return {"value": 0}
        return {}


class TestSummary:
    def test_lesson_summary_after_completion(
        self, client, auth_headers_child, published_package
    ):
        # Start and complete a 1-question lesson
        resp = client.post(
            "/api/lessons/start",
            json={"package_id": published_package.id, "question_count": 1},
            headers=auth_headers_child,
        )
        data = resp.json()
        session_id = data["session_id"]
        question = data["question"]

        # Answer it
        client.post(
            f"/api/lessons/{session_id}/answer",
            json={
                "item_id": question["item_id"],
                "given_answer": json.dumps({"knew": True}),
            },
            headers=auth_headers_child,
        )

        # Get summary
        resp = client.get(
            f"/api/lessons/{session_id}/summary",
            headers=auth_headers_child,
        )
        assert resp.status_code == 200
        summary = resp.json()
        assert summary["total_questions"] == 1
        assert "correct_count" in summary
        assert "score_percent" in summary
        assert len(summary["answers"]) == 1

    def test_summary_not_available_during_lesson(
        self, client, auth_headers_child, published_package
    ):
        resp = client.post(
            "/api/lessons/start",
            json={"package_id": published_package.id, "question_count": 3},
            headers=auth_headers_child,
        )
        session_id = resp.json()["session_id"]

        resp = client.get(
            f"/api/lessons/{session_id}/summary",
            headers=auth_headers_child,
        )
        assert resp.status_code == 400
