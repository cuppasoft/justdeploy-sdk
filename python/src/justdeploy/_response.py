from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any, TypedDict

import httpx

MAX_SAFE_INTEGER = 2**53 - 1


class ErrorMetadata(TypedDict):
    status: int
    retry_after: int | None
    request_id: str | None
    details: Mapping[str, Any]


def _retry_delay(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not 0 < value <= MAX_SAFE_INTEGER or int(value) != value:
        return None
    return int(value)


def _request_id(value: object) -> str | None:
    return value if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) else None


def error_metadata(response: httpx.Response, payload: object = None) -> ErrorMetadata:
    """The body owns diagnostics; headers recover missing or malformed fields."""
    details = payload if isinstance(payload, dict) else {}
    header_delay = response.headers.get("retry-after", "")
    # Bound parsing to JavaScript's integer range and Python's integer-string limit.
    normalized_delay = header_delay.lstrip("0")
    header_seconds = (
        _retry_delay(int(normalized_delay or "0")) if re.fullmatch(r"[0-9]+", header_delay) and len(normalized_delay) <= 16 else None
    )
    return {
        "status": response.status_code,
        "retry_after": _retry_delay(details.get("retryAfter")) or header_seconds,
        "request_id": _request_id(details.get("requestId")) or _request_id(response.headers.get("x-request-id")),
        "details": details,
    }
