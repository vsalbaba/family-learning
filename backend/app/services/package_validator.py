"""Two-tier JSON validation for learning packages."""

import json
from dataclasses import dataclass, field
from pathlib import Path

import jsonschema

SCHEMA_PATH = Path(__file__).parent.parent / "package_schema" / "package_v1.json"
VALID_TYPES = {
    "flashcard", "multiple_choice", "true_false",
    "fill_in", "matching", "ordering", "math_input",
}


@dataclass
class ValError:
    code: str
    message: str
    path: str
    severity: str  # "error" or "warning"


@dataclass
class ValidationResult:
    is_valid: bool = True
    hard_errors: list[ValError] = field(default_factory=list)
    soft_warnings: list[ValError] = field(default_factory=list)
    parsed: dict | None = None


def _load_schema() -> dict:
    """Load the JSON Schema for package validation."""
    with open(SCHEMA_PATH) as f:
        return json.load(f)


def _add_error(result: ValidationResult, code: str, message: str, path: str):
    """Append a hard error to the validation result."""
    result.hard_errors.append(ValError(code, message, path, "error"))
    result.is_valid = False


def _add_warning(result: ValidationResult, code: str, message: str, path: str):
    """Append a soft warning to the validation result."""
    result.soft_warnings.append(ValError(code, message, path, "warning"))


def validate_package(raw: str) -> ValidationResult:
    """Validate a package JSON string. Returns ValidationResult."""
    result = ValidationResult()

    # Phase 1: Parse JSON
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as e:
        _add_error(result, "E001", f"Invalid JSON: {e}", "")
        return result

    # Phase 2: Schema validation
    schema = _load_schema()
    validator = jsonschema.Draft7Validator(schema)
    schema_errors = list(validator.iter_errors(data))

    for err in schema_errors:
        path = ".".join(str(p) for p in err.absolute_path) or ""
        _categorize_schema_error(result, err, path)

    # Phase 3: Semantic validation (even if schema errors exist, collect what we can)
    if isinstance(data, dict):
        _validate_semantics(result, data)

    if result.is_valid:
        result.parsed = data

    return result


def _categorize_schema_error(result: ValidationResult, err, path: str):
    """Map jsonschema errors to our error codes."""
    msg = err.message

    # Missing required properties
    if err.validator == "required":
        prop = err.message.split("'")[1] if "'" in err.message else ""
        if path == "":
            if prop == "metadata":
                _add_error(result, "E002", "Missing required field 'metadata'", "")
            elif prop == "items":
                _add_error(result, "E004", "Missing required field 'items'", "")
        elif path == "metadata" or path.startswith("metadata"):
            if prop == "name":
                _add_error(result, "E003", "Missing required field 'metadata.name'", "metadata")
        else:
            # Item-level required fields
            _map_item_required_error(result, prop, path)
        return

    # minItems on items array
    if err.validator == "minItems" and (path == "items" or path == ""):
        _add_error(result, "E005", "'items' array must not be empty", "items")
        return

    # Enum violations
    if err.validator == "enum":
        if "type" in path:
            _add_error(result, "E007", f"Unknown activity type: {msg}", path)
            return

    # Type mismatches
    if err.validator == "type":
        _add_error(result, "E017", f"Type mismatch: {msg}", path)
        return

    # Catch-all for other schema errors
    _add_error(result, "E017", msg, path)


def _map_item_required_error(result: ValidationResult, prop: str, path: str):
    """Map missing required properties on items to specific error codes."""
    code_map = {
        "type": ("E006", "Item missing required field 'type'"),
        "question": ("E008", "Item missing required field 'question'"),
        "options": ("E009", "multiple_choice item missing 'options'"),
        "correct": ("E009", "Item missing required field 'correct'"),
        "accepted_answers": ("E012", "fill_in item missing 'accepted_answers'"),
        "pairs": ("E013", "matching item missing 'pairs'"),
        "correct_order": ("E014", "ordering item missing 'correct_order'"),
        "correct_value": ("E015", "math_input item missing 'correct_value'"),
        "answer": ("E016", "flashcard item missing 'answer'"),
    }
    if prop in code_map:
        code, message = code_map[prop]
        _add_error(result, code, message, path)
    else:
        _add_error(result, "E017", f"Missing required field '{prop}'", path)


def _validate_semantics(result: ValidationResult, data: dict):
    """Semantic validations beyond JSON Schema."""
    items = data.get("items")
    metadata = data.get("metadata")

    if not isinstance(items, list):
        return

    # Check items
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        path = f"items[{i}]"
        item_type = item.get("type")

        # E010: multiple_choice correct index out of bounds
        if item_type == "multiple_choice":
            options = item.get("options", [])
            correct = item.get("correct")
            if isinstance(correct, int) and isinstance(options, list):
                if correct >= len(options) or correct < 0:
                    _add_error(
                        result, "E010",
                        f"'correct' index {correct} is out of bounds (options has {len(options)} items)",
                        f"{path}.correct",
                    )

        # E011: true_false missing correct (if type exists but correct is wrong type)
        if item_type == "true_false":
            correct = item.get("correct")
            if correct is not None and not isinstance(correct, bool):
                _add_error(result, "E011", "'correct' must be a boolean for true_false", f"{path}.correct")

        # E013: matching fewer than 2 pairs (if pairs exists but too short)
        if item_type == "matching":
            pairs = item.get("pairs", [])
            if isinstance(pairs, list) and 0 < len(pairs) < 2:
                _add_error(result, "E013", "matching requires at least 2 pairs", f"{path}.pairs")

        # E014: ordering fewer than 2 items
        if item_type == "ordering":
            order = item.get("correct_order", [])
            if isinstance(order, list) and 0 < len(order) < 2:
                _add_error(result, "E014", "ordering requires at least 2 items", f"{path}.correct_order")

        # Soft warnings per item
        if "hint" not in item:
            _add_warning(result, "W003", "Item missing 'hint'", path)
        if "explanation" not in item:
            _add_warning(result, "W004", "Item missing 'explanation'", path)
        if item_type == "multiple_choice":
            options = item.get("options", [])
            if isinstance(options, list):
                if len(options) == 1:
                    _add_warning(result, "W006", "multiple_choice has only 1 option", f"{path}.options")
                elif len(options) == 2:
                    _add_warning(result, "W005", "multiple_choice has fewer than 3 options", f"{path}.options")
        if item_type == "fill_in":
            answers = item.get("accepted_answers", [])
            if isinstance(answers, list) and len(answers) == 1:
                _add_warning(result, "W011", "fill_in has only 1 accepted answer", f"{path}.accepted_answers")

    # Package-level warnings
    if len(items) < 5:
        _add_warning(result, "W001", f"Package has only {len(items)} items (fewer than 5)", "items")
    if len(items) > 100:
        _add_warning(result, "W002", f"Package has {len(items)} items (more than 100)", "items")

    # W007: duplicate questions
    questions = [
        item.get("question") for item in items
        if isinstance(item, dict) and item.get("question")
    ]
    seen = set()
    for q in questions:
        if q in seen:
            _add_warning(result, "W007", f"Duplicate question: '{q[:50]}'", "items")
            break
        seen.add(q)

    # W008, W009: missing metadata fields
    if isinstance(metadata, dict):
        if "subject" not in metadata:
            _add_warning(result, "W008", "Missing 'metadata.subject'", "metadata")
        if "difficulty" not in metadata:
            _add_warning(result, "W009", "Missing 'metadata.difficulty'", "metadata")

    # W010: all same activity type
    types = {
        item.get("type") for item in items
        if isinstance(item, dict) and item.get("type")
    }
    if len(types) == 1 and len(items) > 1:
        _add_warning(result, "W010", "All items are the same activity type", "items")
