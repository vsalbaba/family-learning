"""Lightweight SVG validation for package import.

This is NOT a security sandbox. SVGs are rendered via <img src="data:...">,
where browsers block script execution — that is the primary security layer.
This validator catches common mistakes in hand-authored packages.
"""

import re

MAX_SVG_BYTES = 102_400  # 100 KB

BLOCKED_SUBSTRINGS = [
    "<script",
    "<foreignobject",
    "<iframe",
    "<object",
    "<embed",
    "<image",
    "<!doctype",
    "<?xml",
    "javascript:",
    "data:text/html",
    'href="http',
    "href='http",
    'href="//',
    "href='//",
    'xlink:href="http',
    "xlink:href='http",
    'xlink:href="//',
    "xlink:href='//",
]

EVENT_HANDLER_RE = re.compile(r"\son[a-z]+\s*=", re.IGNORECASE)


def validate_svg(svg: str) -> list[str]:
    """Return list of error messages. Empty list means valid."""
    errors: list[str] = []
    stripped = svg.strip()
    lower = stripped.lower()

    if not stripped.startswith("<svg"):
        errors.append("SVG musí začínat přímo tagem <svg")

    if "</svg>" not in lower:
        errors.append("SVG musí obsahovat uzavírací tag </svg>")

    if len(stripped.encode("utf-8")) > MAX_SVG_BYTES:
        errors.append(f"SVG překračuje limit {MAX_SVG_BYTES // 1024} KB")

    for pattern in BLOCKED_SUBSTRINGS:
        if pattern in lower:
            errors.append(f"SVG obsahuje nepovolený pattern: {pattern}")

    if EVENT_HANDLER_RE.search(stripped):
        errors.append("SVG obsahuje event handler atribut typu onload/onclick")

    return errors
