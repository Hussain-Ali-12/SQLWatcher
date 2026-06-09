from __future__ import annotations

import re

UNION_SELECT_RE = re.compile(r"\bunion\s+select\b", re.IGNORECASE)
COMMENT_RE = re.compile(r"(--|/\*|\*/|#)")
TIME_BASED_RE = re.compile(r"\b(pg_sleep|sleep|benchmark)\s*\(", re.IGNORECASE)
DDL_RE = re.compile(r"\b(drop|alter|truncate)\b", re.IGNORECASE)
TAUTOLOGY_RE = re.compile(
    r"\b(and|or)\s+(['\"]?)([a-z0-9_]+)\2\s*=\s*(['\"]?)([a-z0-9_]+)\4",
    re.IGNORECASE,
)

# Catches bare WHERE tautologies such as:
#   WHERE '1' = '1'
#   WHERE a = a
# The older TAUTOLOGY_RE only matched AND/OR-prefixed tautologies.
WHERE_TAUTOLOGY_RE = re.compile(
    r"\bwhere\s+(['\"]?)([a-z0-9_]+)\1\s*=\s*(['\"]?)([a-z0-9_]+)\3",
    re.IGNORECASE,
)

STACKED_CONTINUATION_RE = re.compile(r";\s*(select|insert|update|delete|drop|alter|truncate|create)\b", re.IGNORECASE)
