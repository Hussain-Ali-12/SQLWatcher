from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
import re

from shared.detection.patterns import (
    COMMENT_RE,
    DDL_RE,
    STACKED_CONTINUATION_RE,
    TAUTOLOGY_RE,
    TIME_BASED_RE,
    UNION_SELECT_RE,
    WHERE_TAUTOLOGY_RE,
)
from shared.sql.normaliser import normalize_sql
from shared.sql.parser import contains_select_star, extract_table_names, get_query_type

SENSITIVE_TABLES = {"users", "customers", "salary_records", "employees"}
SEVERITY_RANK = {"NONE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
ACTION_RANK = {"ALLOW": 0, "FLAG": 1, "BLOCK": 2}

DEFAULT_RULES = {
    "UNION_SQLI",
    "STACKED_QUERY",
    "COMMENT_ABUSE",
    "BOOLEAN_TAUTOLOGY",
    "TIME_BASED_SQLI",
    "SCHEMA_ENUMERATION",
    "DANGEROUS_DDL",
    "DELETE_WITHOUT_WHERE",
    "WRITE_OPERATION",
    "MASS_EXFILTRATION",
    "OFF_HOURS_SENSITIVE_ACCESS",
}


@dataclass(frozen=True)
class InspectionResult:
    action: str
    severity: str
    risk_score: int
    detection_method: str
    explanation: str
    query_type: str | None = None
    normalized_sql: str | None = None
    features: dict[str, Any] | None = None


def _has_boolean_tautology(sql_lower: str) -> bool:
    constant_match = TAUTOLOGY_RE.search(sql_lower)
    if constant_match and constant_match.group(3) == constant_match.group(5):
        return True

    where_match = WHERE_TAUTOLOGY_RE.search(sql_lower)
    if where_match and where_match.group(2) == where_match.group(4):
        return True

    return False


def detect_query(
    sql: str,
    current_hour: int | None = None,
    enabled_rules: set[str] | None = None,
    custom_rules: list[dict[str, Any]] | None = None,
) -> InspectionResult:
    raw = sql.strip()
    lowered = raw.lower()
    normalized = normalize_sql(raw)
    query_type = get_query_type(raw)
    tables = extract_table_names(raw)
    active_rules = DEFAULT_RULES if enabled_rules is None else enabled_rules

    risk_score = 0
    severity = "NONE"
    action = "ALLOW"
    methods: list[str] = []
    explanations: list[str] = []

    def apply(score: int, sev: str, act: str, method: str, explanation: str) -> None:
        nonlocal risk_score, severity, action
        if method not in active_rules:
            return
        risk_score = max(risk_score, score)
        if method not in methods:
            methods.append(method)
        explanations.append(explanation)
        if SEVERITY_RANK[sev] > SEVERITY_RANK[severity]:
            severity = sev
        if ACTION_RANK[act] > ACTION_RANK[action]:
            action = act

    if not raw:
        apply(40, "LOW", "BLOCK", "EMPTY_QUERY", "Empty SQL query received.")

    if UNION_SELECT_RE.search(lowered):
        apply(85, "HIGH", "BLOCK", "UNION_SQLI", "UNION SELECT pattern indicates possible SQL injection.")

    if raw.count(";") > 1 or STACKED_CONTINUATION_RE.search(raw):
        apply(95, "CRITICAL", "BLOCK", "STACKED_QUERY", "Multiple SQL statements detected in one request.")

    if COMMENT_RE.search(lowered):
        apply(60, "MEDIUM", "FLAG", "COMMENT_ABUSE", "SQL comment syntax detected, often used to bypass filters.")

    if _has_boolean_tautology(lowered):
        apply(65, "MEDIUM", "FLAG", "BOOLEAN_TAUTOLOGY", "Boolean tautology-like condition detected.")

    if TIME_BASED_RE.search(lowered):
        apply(85, "HIGH", "BLOCK", "TIME_BASED_SQLI", "Time-delay function detected.")

    if "information_schema" in lowered or "pg_catalog" in lowered:
        apply(80, "HIGH", "BLOCK", "SCHEMA_ENUMERATION", "Query accesses database metadata/catalog tables.")

    if DDL_RE.search(lowered):
        apply(95, "CRITICAL", "BLOCK", "DANGEROUS_DDL", "Dangerous DDL operation detected.")

    if query_type == "DELETE" and " where " not in f" {lowered} ":
        apply(90, "HIGH", "BLOCK", "DELETE_WITHOUT_WHERE", "DELETE without WHERE can cause destructive data loss.")

    if query_type in {"INSERT", "UPDATE", "DELETE"}:
        apply(35, "LOW", "FLAG", "WRITE_OPERATION", "Write operation observed and logged for analyst visibility.")

    if query_type == "SELECT" and contains_select_star(raw) and tables.intersection(SENSITIVE_TABLES) and " limit " not in f" {lowered} ":
        apply(55, "MEDIUM", "FLAG", "MASS_EXFILTRATION", "SELECT * on a sensitive table without LIMIT detected.")

    hour = datetime.now().hour if current_hour is None else current_hour
    if tables.intersection({"salary_records", "employees"}) and (hour < 8 or hour > 20):
        apply(70, "HIGH", "FLAG", "OFF_HOURS_SENSITIVE_ACCESS", "Sensitive HR/salary data accessed outside normal working hours.")

    for rule in custom_rules or []:
        name = str(rule.get("rule_name") or "").strip().upper()
        if not name or name not in active_rules:
            continue
        rule_type = str(rule.get("rule_type") or "KEYWORD").upper()
        match_target = str(rule.get("match_target") or "RAW_SQL").upper()
        pattern = str(rule.get("match_pattern") or "")
        if not pattern:
            continue
        target = normalized if match_target == "NORMALIZED_SQL" else raw
        matched = False
        try:
            if rule_type == "REGEX":
                matched = re.search(pattern, target, re.IGNORECASE) is not None
            elif rule_type == "KEYWORD":
                matched = pattern.lower() in target.lower()
        except re.error:
            matched = False
        if matched:
            apply(
                int(rule.get("risk_score") or 50),
                str(rule.get("severity") or "MEDIUM").upper(),
                str(rule.get("action") or "FLAG").upper(),
                name,
                f"Custom rule {name} matched {rule_type.lower()} pattern.",
            )

    if not methods:
        explanations.append("No enabled suspicious pattern detected.")

    return InspectionResult(
        action=action,
        severity=severity,
        risk_score=risk_score,
        detection_method=", ".join(methods) if methods else "NONE",
        explanation=" ".join(explanations),
        query_type=query_type,
        normalized_sql=normalized,
    )
