"""Utilities for parsing item data from package JSON format."""


def extract_answer_data(activity_type: str, item_data: dict) -> dict:
    """Extract answer-related fields from raw item data for storage.

    Picks only the fields relevant for answer checking and display from
    the full item dict (which also contains question, hint, etc.).

    Args:
        activity_type: Activity type identifier (e.g. 'flashcard', 'multiple_choice').
        item_data: Raw item dictionary from package JSON.

    Returns:
        Dict containing only the answer-relevant fields for the given activity type.
    """
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
