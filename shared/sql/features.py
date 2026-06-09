from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from shared.sql.parser import contains_select_star, extract_table_names, get_query_type

SENSITIVE_TABLES = {"users", "customers", "salary_records", "employees"}

SQL_KEYWORDS = {
    "select", "insert", "update", "delete", "drop", "alter", "truncate", "union",
    "join", "where", "group", "order", "limit", "having", "sleep", "pg_sleep",
    "information_schema", "pg_catalog",
}


def extract_query_features(sql: str, db_user: str = "web_app", timestamp: datetime | None = None) -> dict[str, Any]:
    raw = sql.strip()
    lowered = raw.lower()
    ts = timestamp or datetime.now()

    table_names = sorted(extract_table_names(raw))
    query_type = get_query_type(raw)
    where_condition_count = _count_where_conditions(lowered)
    has_limit = bool(re.search(r"\blimit\b", lowered))
    has_select_star = contains_select_star(raw)
    keyword_count = sum(1 for keyword in SQL_KEYWORDS if re.search(rf"\b{re.escape(keyword)}\b", lowered))

    return {
        "db_user": db_user,
        "query_type": query_type,
        "table_names": table_names,
        "table_count": len(table_names),
        "sensitive_table_count": len(set(table_names).intersection(SENSITIVE_TABLES)),
        "has_select_star": has_select_star,
        "has_limit": has_limit,
        "where_condition_count": where_condition_count,
        "hour_of_day": ts.hour,
        "keyword_count": keyword_count,
    }


def _count_where_conditions(sql_lower: str) -> int:
    if " where " not in f" {sql_lower} ":
        return 0

    where_part = re.split(r"\bwhere\b", sql_lower, maxsplit=1)[-1]
    where_part = re.split(r"\b(group by|order by|limit|having)\b", where_part, maxsplit=1)[0]
    connectors = re.findall(r"\b(and|or)\b", where_part)
    return 1 + len(connectors) if where_part.strip() else 0
