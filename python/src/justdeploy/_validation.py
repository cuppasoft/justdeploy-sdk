from urllib.parse import quote, urlencode

from .errors import JustDeployValidationError


def path_segment(value: str, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise JustDeployValidationError(f"{label} must be a non-empty string.")
    return quote(value, safe="")


def page_query(*, limit: int | None, cursor: int | None, max_limit: int) -> str:
    values: dict[str, str] = {}
    if limit is not None:
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= max_limit:
            raise JustDeployValidationError(f"limit must be an integer between 1 and {max_limit}.")
        values["limit"] = str(limit)
    if cursor is not None:
        if isinstance(cursor, bool) or not isinstance(cursor, int) or cursor <= 0:
            raise JustDeployValidationError("cursor must be a positive integer.")
        values["cursor"] = str(cursor)
    return f"?{urlencode(values)}" if values else ""
