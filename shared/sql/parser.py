from __future__ import annotations

import re

import sqlglot
from sqlglot import exp


SELECT_STAR_RE = re.compile(r"\bselect\s+(?:distinct\s+)?\*\b", re.IGNORECASE)


def parse_sql(sql: str):
    try:
        return sqlglot.parse_one(sql, read="postgres")
    except Exception:
        return None


def get_query_type(sql: str) -> str:
    parsed = parse_sql(sql)
    if parsed is None:
        first_token = sql.strip().split(maxsplit=1)[0].upper() if sql.strip() else "UNKNOWN"
        return first_token or "UNKNOWN"
    return parsed.key.upper() if parsed.key else "UNKNOWN"


def extract_table_names(sql: str) -> set[str]:
    parsed = parse_sql(sql)
    if parsed is None:
        return set()
    return {table.name.lower() for table in parsed.find_all(exp.Table) if table.name}


def _expression_is_select_star(expression: exp.Expression) -> bool:
    """Return True only when a SELECT projection is the wildcard itself.

    sqlglot represents COUNT(*) with an exp.Star nested inside an aggregate
    expression. That is not a row-dump projection and must not trigger the
    MASS_EXFILTRATION rule. Only top-level projection stars such as SELECT * or
    SELECT alias.* should return True here.
    """
    if isinstance(expression, exp.Star):
        return True
    if isinstance(expression, exp.Column) and isinstance(expression.this, exp.Star):
        return True
    if isinstance(expression, exp.Alias):
        return _expression_is_select_star(expression.this)
    return False


def contains_select_star(sql: str) -> bool:
    parsed = parse_sql(sql)
    if parsed is None:
        return SELECT_STAR_RE.search(sql) is not None

    selects = list(parsed.find_all(exp.Select))
    if isinstance(parsed, exp.Select):
        selects.insert(0, parsed)

    for select in selects:
        if any(_expression_is_select_star(expression) for expression in select.expressions):
            return True
    return False
