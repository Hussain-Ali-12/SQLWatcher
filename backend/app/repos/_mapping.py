from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal
from typing import Any


def value(row: Mapping[str, Any], key: str, default: Any = None) -> Any:
    """Return a row value while tolerating missing optional selected columns."""
    return row[key] if key in row else default


def as_float(raw: Any, default: float = 0.0) -> float:
    """Convert asyncpg numeric/Decimal values to plain floats for records."""
    if raw is None:
        return default
    if isinstance(raw, Decimal):
        return float(raw)
    return float(raw)


def as_int(raw: Any, default: int = 0) -> int:
    """Convert database integer-ish values to plain ints for records."""
    if raw is None:
        return default
    return int(raw)


def as_bool(raw: Any, default: bool = False) -> bool:
    """Convert nullable database booleans to plain bools for records."""
    if raw is None:
        return default
    return bool(raw)
