import json
from pathlib import Path

import pytest

from app.services.package_validator import validate_package

FIXTURES = Path(__file__).parent / "fixtures"


def _pkg(items=None, metadata=None):
    """Helper to build a minimal valid package JSON string."""
    d = {
        "metadata": metadata or {"name": "Test"},
        "items": items or [
            {"type": "true_false", "question": "Q", "correct": True,
             "hint": "h", "explanation": "e"}
        ],
    }
    return json.dumps(d)


# ── Hard errors ──────────────────────────────────────────────────


class TestHardErrors:
    def test_invalid_json_string(self):
        result = validate_package("not json {{{")
        assert not result.is_valid
        assert any(e.code == "E001" for e in result.hard_errors)

    def test_missing_metadata(self):
        raw = json.dumps({"items": [{"type": "true_false", "question": "Q", "correct": True}]})
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E002" for e in result.hard_errors)

    def test_missing_metadata_name(self):
        raw = json.dumps({
            "metadata": {},
            "items": [{"type": "true_false", "question": "Q", "correct": True}],
        })
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E003" for e in result.hard_errors)

    def test_missing_items(self):
        raw = json.dumps({"metadata": {"name": "Test"}})
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E004" for e in result.hard_errors)

    def test_empty_items_array(self):
        raw = json.dumps({"metadata": {"name": "Test"}, "items": []})
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E005" for e in result.hard_errors)

    def test_item_missing_type(self):
        raw = _pkg(items=[{"question": "Q"}])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E006" for e in result.hard_errors)

    def test_item_unknown_type(self):
        raw = (FIXTURES / "invalid_bad_types.json").read_text()
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E007" for e in result.hard_errors)

    def test_item_missing_question(self):
        raw = _pkg(items=[{"type": "true_false", "correct": True}])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E008" for e in result.hard_errors)

    def test_mc_missing_options(self):
        raw = _pkg(items=[{"type": "multiple_choice", "question": "Q", "correct": 0}])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E009" for e in result.hard_errors)

    def test_mc_correct_out_of_bounds(self):
        raw = (FIXTURES / "invalid_mc_out_of_bounds.json").read_text()
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E010" for e in result.hard_errors)

    def test_tf_missing_correct(self):
        raw = _pkg(items=[{"type": "true_false", "question": "Q"}])
        result = validate_package(raw)
        assert not result.is_valid
        codes = {e.code for e in result.hard_errors}
        # Should get E011 or a required-field error for 'correct'
        assert "E011" in codes or "E009" in codes or any(
            "correct" in e.message for e in result.hard_errors
        )

    def test_fillin_missing_accepted_answers(self):
        raw = _pkg(items=[{"type": "fill_in", "question": "Q"}])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E012" for e in result.hard_errors)

    def test_matching_fewer_than_2_pairs(self):
        raw = _pkg(items=[{
            "type": "matching", "question": "Q",
            "pairs": [{"left": "A", "right": "B"}],
        }])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E013" for e in result.hard_errors)

    def test_ordering_fewer_than_2_items(self):
        raw = _pkg(items=[{
            "type": "ordering", "question": "Q",
            "correct_order": ["Only one"],
        }])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E014" for e in result.hard_errors)

    def test_math_missing_correct_value(self):
        raw = _pkg(items=[{"type": "math_input", "question": "Q"}])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E015" for e in result.hard_errors)

    def test_flashcard_missing_answer(self):
        raw = _pkg(items=[{"type": "flashcard", "question": "Q"}])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E016" for e in result.hard_errors)

    def test_type_mismatch_correct_is_string(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": "true",
        }])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E017" or e.code == "E011" for e in result.hard_errors)


# ── Soft warnings ────────────────────────────────────────────────


class TestSoftWarnings:
    def test_fewer_than_5_items(self):
        raw = _pkg()
        result = validate_package(raw)
        assert result.is_valid
        assert any(w.code == "W001" for w in result.soft_warnings)

    def test_more_than_100_items(self):
        items = [
            {"type": "true_false", "question": f"Q{i}", "correct": True,
             "hint": "h", "explanation": "e"}
            for i in range(101)
        ]
        raw = _pkg(items=items)
        result = validate_package(raw)
        assert result.is_valid
        assert any(w.code == "W002" for w in result.soft_warnings)

    def test_item_missing_hint(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": True,
            "explanation": "e",
        }])
        result = validate_package(raw)
        assert any(w.code == "W003" for w in result.soft_warnings)

    def test_item_missing_explanation(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": True,
            "hint": "h",
        }])
        result = validate_package(raw)
        assert any(w.code == "W004" for w in result.soft_warnings)

    def test_mc_fewer_than_3_options(self):
        raw = _pkg(items=[{
            "type": "multiple_choice", "question": "Q",
            "options": ["A", "B"], "correct": 0,
            "hint": "h", "explanation": "e",
        }])
        result = validate_package(raw)
        assert any(w.code == "W005" for w in result.soft_warnings)

    def test_mc_single_option(self):
        # Need minItems >= 2 to pass schema, but we test semantic check
        # Actually, schema requires minItems:2 so this would be a hard error
        # Let's test with the semantic layer anyway
        raw = _pkg(items=[{
            "type": "multiple_choice", "question": "Q",
            "options": ["Only"], "correct": 0,
            "hint": "h", "explanation": "e",
        }])
        result = validate_package(raw)
        # Either hard error from schema or warning from semantic
        if result.is_valid:
            assert any(w.code == "W006" for w in result.soft_warnings)

    def test_duplicate_questions(self):
        raw = _pkg(items=[
            {"type": "true_false", "question": "Same?", "correct": True,
             "hint": "h", "explanation": "e"},
            {"type": "true_false", "question": "Same?", "correct": False,
             "hint": "h", "explanation": "e"},
        ])
        result = validate_package(raw)
        assert any(w.code == "W007" for w in result.soft_warnings)

    def test_missing_subject(self):
        raw = _pkg(metadata={"name": "No subject"})
        result = validate_package(raw)
        assert any(w.code == "W008" for w in result.soft_warnings)

    def test_missing_difficulty(self):
        raw = _pkg(metadata={"name": "No diff", "subject": "Math"})
        result = validate_package(raw)
        assert any(w.code == "W009" for w in result.soft_warnings)

    def test_all_same_activity_type(self):
        raw = _pkg(items=[
            {"type": "true_false", "question": "Q1", "correct": True,
             "hint": "h", "explanation": "e"},
            {"type": "true_false", "question": "Q2", "correct": False,
             "hint": "h", "explanation": "e"},
        ])
        result = validate_package(raw)
        assert any(w.code == "W010" for w in result.soft_warnings)

    def test_fillin_single_accepted_answer(self):
        raw = _pkg(items=[{
            "type": "fill_in", "question": "Q",
            "accepted_answers": ["only"],
            "hint": "h", "explanation": "e",
        }])
        result = validate_package(raw)
        assert any(w.code == "W011" for w in result.soft_warnings)


# ── Positive tests ───────────────────────────────────────────────


class TestPositive:
    def test_valid_package_all_types(self):
        raw = (FIXTURES / "valid_package_all_types.json").read_text()
        result = validate_package(raw)
        assert result.is_valid
        assert len(result.hard_errors) == 0
        assert result.parsed is not None

    def test_valid_package_minimal(self):
        raw = (FIXTURES / "valid_package_minimal.json").read_text()
        result = validate_package(raw)
        assert result.is_valid
        # Should have warnings (< 5 items, missing subject, etc.)
        assert len(result.soft_warnings) > 0

    def test_valid_with_warnings_still_passes(self):
        raw = (FIXTURES / "warnings_only.json").read_text()
        result = validate_package(raw)
        assert result.is_valid is True
        assert len(result.soft_warnings) > 0

    def test_multiple_hard_errors_reported(self):
        raw = json.dumps({
            "metadata": {},
            "items": [],
        })
        result = validate_package(raw)
        assert not result.is_valid
        # Should report both missing name and empty items
        assert len(result.hard_errors) >= 2


# ── Image validation ────────────────────────────────────────────


VALID_SVG = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>'


class TestImageValidation:
    def test_package_with_valid_image_passes(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": True,
            "hint": "h", "explanation": "e",
            "image": {"type": "svg", "svg": VALID_SVG, "alt": "A circle"},
        }])
        result = validate_package(raw)
        assert result.is_valid

    def test_package_without_image_still_passes(self):
        raw = _pkg()
        result = validate_package(raw)
        assert result.is_valid

    def test_invalid_svg_blocks_import(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": True,
            "hint": "h", "explanation": "e",
            "image": {"type": "svg", "svg": "<script>alert(1)</script>"},
        }])
        result = validate_package(raw)
        assert not result.is_valid
        assert any(e.code == "E018" for e in result.hard_errors)

    def test_missing_alt_generates_warning(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": True,
            "hint": "h", "explanation": "e",
            "image": {"type": "svg", "svg": VALID_SVG},
        }])
        result = validate_package(raw)
        assert result.is_valid
        assert any(e.code == "W012" for e in result.soft_warnings)

    def test_image_with_alt_no_w012(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": True,
            "hint": "h", "explanation": "e",
            "image": {"type": "svg", "svg": VALID_SVG, "alt": "desc"},
        }])
        result = validate_package(raw)
        assert result.is_valid
        assert not any(e.code == "W012" for e in result.soft_warnings)

    def test_image_schema_rejects_extra_fields(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": True,
            "image": {"type": "svg", "svg": VALID_SVG, "extra": "bad"},
        }])
        result = validate_package(raw)
        assert not result.is_valid

    def test_image_schema_rejects_missing_svg(self):
        raw = _pkg(items=[{
            "type": "true_false", "question": "Q", "correct": True,
            "image": {"type": "svg"},
        }])
        result = validate_package(raw)
        assert not result.is_valid
