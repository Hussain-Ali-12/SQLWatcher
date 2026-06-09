from __future__ import annotations

from shared.sql.parser import parse_sql


def normalize_sql(sql: str) -> str:
    parsed = parse_sql(sql)
    if parsed is None:
        return sql.strip()
    return parsed.sql(dialect="postgres")
