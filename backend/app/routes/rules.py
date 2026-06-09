from __future__ import annotations

import re
from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import get_current_user, require_roles
from app.dependencies.db import Repos, get_repos
from app.models.records import RuleCreatePayload, RuleUpdatePayload
from app.models.schemas import RuleCreateRequest, RuleUpdateRequest
from app.services.rule_service import RuleService
from app.services.realtime_sync import force_realtime_sync

router = APIRouter(prefix="/api", tags=["Rules"])

ALLOWED_SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
ALLOWED_ACTIONS = {"ALLOW", "FLAG", "BLOCK"}
ALLOWED_RULE_TYPES = {"KEYWORD", "REGEX", "BUILTIN"}
ALLOWED_MATCH_TARGETS = {"RAW_SQL", "NORMALIZED_SQL"}


def _record_dict(record) -> dict:
    return asdict(record)


def load_default_rules_sql() -> str:
    migration_path = Path(__file__).resolve().parents[1] / "core" / "migrations" / "0004_seed_default_rules.sql"
    return migration_path.read_text(encoding="utf-8")


def normalize_rule_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", value.strip().upper()).strip("_")
    return cleaned[:128]


def validate_rule_fields(rule_type: str, severity: str, action: str, match_target: str, pattern: str | None, is_system: bool = False) -> None:
    if severity not in ALLOWED_SEVERITIES:
        raise HTTPException(status_code=400, detail="Invalid severity. Use LOW, MEDIUM, HIGH, or CRITICAL.")
    if action not in ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail="Invalid action. Use ALLOW, FLAG, or BLOCK.")
    if rule_type not in ALLOWED_RULE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid rule type. Use KEYWORD or REGEX for custom rules.")
    if match_target not in ALLOWED_MATCH_TARGETS:
        raise HTTPException(status_code=400, detail="Invalid match target. Use RAW_SQL or NORMALIZED_SQL.")
    if not is_system and not pattern:
        raise HTTPException(status_code=400, detail="Custom rules require a match pattern.")
    if rule_type == "REGEX" and pattern:
        try:
            re.compile(pattern)
        except re.error as exc:
            raise HTTPException(status_code=400, detail=f"Invalid regex pattern: {exc}") from exc


@router.get("/rules")
async def get_rules(current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    return [_record_dict(row) for row in await RuleService(repos.rule).get_all()]


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(payload: RuleCreateRequest, current_user: dict = Depends(require_roles("admin")), repos: Repos = Depends(get_repos)):
    rule_name = normalize_rule_name(payload.rule_name)
    severity = payload.severity.upper()
    action = payload.action.upper()
    rule_type = payload.rule_type.upper()
    match_target = payload.match_target.upper()
    if rule_type == "BUILTIN":
        raise HTTPException(status_code=400, detail="New dashboard rules must be KEYWORD or REGEX rules.")
    validate_rule_fields(rule_type, severity, action, match_target, payload.match_pattern, is_system=False)
    if await repos.rule.get_by_name(rule_name):
        raise HTTPException(status_code=409, detail="A rule with this name already exists.")
    record = await RuleService(repos.rule).create(RuleCreatePayload(rule_name, payload.description, severity, action, payload.enabled, rule_type, payload.match_pattern, match_target, payload.risk_score, False))
    actor = current_user.get("username") or current_user.get("email")
    await repos.audit.insert("RULE_CREATED", f"Custom rule {rule_name} was created.", int(current_user["user_id"]), current_user.get("email"), current_user.get("role"), "rule", record.rule_id, _record_dict(record))
    await force_realtime_sync("rule_created", message=f"Custom rule {rule_name} created.", actor=actor)
    return _record_dict(record)


@router.post("/rules/reset-defaults")
async def reset_default_rules(current_user: dict = Depends(require_roles("admin")), repos: Repos = Depends(get_repos)):
    rows = await repos.rule.reset_system_rules(load_default_rules_sql())
    RuleService(repos.rule).mark_cache_dirty()
    await repos.audit.insert("RULES_RESET", "Built-in detection rules reset to defaults. Custom rules were preserved.", int(current_user["user_id"]), current_user.get("email"), current_user.get("role"), "rules", None, {})
    await force_realtime_sync("rules_reset", message="Built-in detection rules reset to defaults.", actor=current_user.get("username", current_user.get("email")))
    return {"status": "reset", "enabled_rules": [_record_dict(row) for row in rows], "count": len(rows)}


@router.patch("/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: int, current_user: dict = Depends(require_roles("admin")), repos: Repos = Depends(get_repos)):
    rule = await repos.rule.get_by_id(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    enabled = await RuleService(repos.rule).toggle(rule_id)
    await repos.audit.insert("RULE_TOGGLED", f"Rule {rule.rule_name} toggled to {'enabled' if enabled else 'disabled'}.", int(current_user["user_id"]), current_user.get("email"), current_user.get("role"), "rule", rule_id, {})
    await force_realtime_sync("rule_toggled", message=f"Rule {rule.rule_name} toggled.", rule_id=rule_id, enabled=enabled, actor=current_user.get("username", current_user.get("email")))
    return {"rule_id": rule_id, "rule_name": rule.rule_name, "enabled": enabled}


@router.patch("/rules/{rule_id}")
async def update_rule(rule_id: int, payload: RuleUpdateRequest, current_user: dict = Depends(require_roles("admin")), repos: Repos = Depends(get_repos)):
    existing = await repos.rule.get_by_id(rule_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    is_system = existing.is_system
    rule_name = normalize_rule_name(payload.rule_name) if payload.rule_name is not None else existing.rule_name
    description = payload.description if payload.description is not None else existing.description
    severity = (payload.severity if payload.severity is not None else existing.severity).upper()
    action = (payload.action if payload.action is not None else existing.action).upper()
    enabled = payload.enabled if payload.enabled is not None else existing.enabled
    rule_type = (payload.rule_type if payload.rule_type is not None else existing.rule_type or "BUILTIN").upper()
    match_pattern = payload.match_pattern if payload.match_pattern is not None else existing.match_pattern
    match_target = (payload.match_target if payload.match_target is not None else existing.match_target or "RAW_SQL").upper()
    risk_score = payload.risk_score if payload.risk_score is not None else int(existing.risk_score or 50)
    if is_system:
        rule_name = existing.rule_name
        rule_type = "BUILTIN"
        match_pattern = None
        match_target = "RAW_SQL"
    validate_rule_fields(rule_type, severity, action, match_target, match_pattern, is_system=is_system)
    duplicate = await repos.rule.get_by_name(rule_name)
    if duplicate and duplicate.rule_id != rule_id:
        raise HTTPException(status_code=409, detail="Another rule already uses this name.")
    record = await RuleService(repos.rule).update(rule_id, RuleUpdatePayload(rule_name, description, severity, action, enabled, rule_type, match_pattern, match_target, risk_score, is_system))
    if record is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    await repos.audit.insert("RULE_UPDATED", f"Rule {record.rule_name} was updated.", int(current_user["user_id"]), current_user.get("email"), current_user.get("role"), "rule", rule_id, {"severity": severity, "action": action, "enabled": enabled})
    await force_realtime_sync("rule_updated", message=f"Rule {record.rule_name} updated.", rule_id=rule_id, actor=current_user.get("username", current_user.get("email")))
    return _record_dict(record)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: int, current_user: dict = Depends(require_roles("admin")), repos: Repos = Depends(get_repos)):
    existing = await repos.rule.get_by_id(rule_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    if existing.is_system:
        raise HTTPException(status_code=403, detail="Built-in rules cannot be deleted. Disable or edit policy fields instead.")
    await RuleService(repos.rule).delete(rule_id)
    await repos.audit.insert("RULE_DELETED", f"Custom rule {existing.rule_name} was deleted.", int(current_user["user_id"]), current_user.get("email"), current_user.get("role"), "rule", rule_id, {})
    await force_realtime_sync("rule_deleted", message=f"Custom rule {existing.rule_name} deleted.", rule_id=rule_id, actor=current_user.get("username", current_user.get("email")))
    return None


@router.get("/rules/{rule_name}/history")
async def get_rule_history(rule_name: str, days: int = 7, current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    normalised = normalize_rule_name(rule_name)
    rows = await RuleService(repos.rule).get_trigger_history(normalised, days=max(1, min(int(days), 90)))
    return [_record_dict(row) for row in rows]
