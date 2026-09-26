import json
from typing import Any


def load_json(value: Any) -> Any:
    if isinstance(value, str):
        return json.loads(value)
    return value


def with_json(row: dict[str, Any] | None, *fields: str) -> dict[str, Any] | None:
    if row is None:
        return None
    for field in fields:
        row[field] = load_json(row[field])
    return row
