from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
from typing import Any

from dataclasses import asdict

from app.core.database import get_control_pool
from shared.sql.features import extract_query_features
from app.models.records import BaselineProfileRecord
from app.repos.anomaly_repo import AnomalyRepo
from app.repos.baseline_repo import BaselineRepo
from app.repos.feature_repo import FeatureRepo
from app.repos.query_log_repo import QueryLogRepo
from app.ml.isolation_forest_model import (
    ML_ALGORITHM,
    ML_MODEL_VERSION,
    train_isolation_forest,
    score_isolation_forest,
)

MODEL_VERSION = ML_MODEL_VERSION  # hybrid-statistical-iforest-v1
STATISTICAL_MODEL_VERSION = "statistical-v1"
MIN_BASELINE_SAMPLES = 5
STABLE_BASELINE_SAMPLES = 50
MATURE_BASELINE_SAMPLES = 200
STALE_BASELINE_DAYS = 14
TRAINING_MAX_RISK_SCORE = 25
TRAINING_MAX_ANOMALY_SCORE = 39


def _as_float(value: Any) -> float:
    if value is None:
        return 0.0
    return float(value)


def _as_json_mapping(value: Any) -> dict[str, Any]:
    if value is None:
        return {}

    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        current: Any = value
        for _ in range(3):
            if not isinstance(current, str):
                break
            try:
                current = json.loads(current)
            except json.JSONDecodeError:
                return {}
        return current if isinstance(current, dict) else {}

    try:
        converted = dict(value)
        return converted if isinstance(converted, dict) else {}
    except Exception:
        return {}


async def persist_features(query_id: int, sql: str, db_user: str) -> dict[str, Any]:
    features = extract_query_features(sql, db_user=db_user)
    pool = get_control_pool()
    async with pool.acquire() as conn:
        await FeatureRepo(conn).insert(query_id, features)
    return features

async def train_baseline(db_user: str | None = None, include_allows_only: bool = True) -> dict[str, Any]:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        query_repo = QueryLogRepo(conn)
        baseline_repo = BaselineRepo(conn)
        users = [db_user] if db_user else await query_repo.get_distinct_db_users()
        trained: list[dict[str, Any]] = []

        for user in users:
            rows = await query_repo.get_training_rows(
                user,
                include_allows_only,
                TRAINING_MAX_RISK_SCORE,
                TRAINING_MAX_ANOMALY_SCORE,
            )
            if not rows:
                continue

            feature_rows = []
            for row in rows:
                feature = extract_query_features(row["raw_sql"], db_user=row["db_user"], timestamp=row["timestamp"])
                feature["risk_score"] = int(row["risk_score"] or 0)
                feature_rows.append(feature)

            profile = _build_profile(user, feature_rows)
            ml_training = train_isolation_forest(feature_rows)

            profile["ml_enabled"] = bool(ml_training["ml_enabled"])
            profile["ml_algorithm"] = ML_ALGORITHM
            profile["ml_model"] = ml_training["ml_model_blob"]
            profile["ml_feature_schema"] = ml_training["ml_feature_schema"]
            profile["ml_training_error"] = ml_training["ml_training_error"]
            profile["model_version"] = MODEL_VERSION if profile["ml_enabled"] else STATISTICAL_MODEL_VERSION

            await _save_profile_with_repo(baseline_repo, profile)
            public_profile = dict(profile)
            public_profile.pop("ml_model", None)
            trained.append(public_profile)

    return {
        "status": "trained",
        "model_version": MODEL_VERSION,
        "ml_algorithm": ML_ALGORITHM,
        "trained_profiles": len(trained),
        "training_filter": {
            "allows_only": include_allows_only,
            "max_risk_score": TRAINING_MAX_RISK_SCORE,
            "max_existing_anomaly_score": TRAINING_MAX_ANOMALY_SCORE,
            "excludes_block_flag_error": include_allows_only,
            "uses_feedback": True,
            "trusted_feedback_types": ["EXPECTED_BEHAVIOR", "FALSE_POSITIVE", "ADD_TO_BASELINE"],
            "excluded_feedback_types": ["CONFIRM_ANOMALY", "CONFIRMED_ANOMALY"],
        },
        "profiles": trained,
    }

async def score_query_against_baseline(query_id: int, db_user: str, features: dict[str, Any]) -> dict[str, Any]:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        baseline_repo = BaselineRepo(conn)
        anomaly_repo = AnomalyRepo(conn)
        profile_record = await baseline_repo.get_by_user(db_user)

        if profile_record is None or int(profile_record.sample_count or 0) < MIN_BASELINE_SAMPLES:
            result = {
                "query_id": query_id,
                "db_user": db_user,
                "anomaly_score": 0,
                "statistical_score": 0,
                "ml_anomaly_score": 0,
                "anomaly_category": "NO_BASELINE",
                "baseline_maturity": "COLD",
                "anomaly_confidence": "LOW",
                "anomaly_reasons": ["Baseline unavailable or insufficient samples."],
                "baseline_available": False,
                "ml_model_available": False,
                "model_version": MODEL_VERSION,
            }
            await _save_anomaly_score_with_repo(anomaly_repo, result)
            return result

        profile = _profile_record_to_mapping(profile_record)
        maturity = _baseline_maturity(int(profile["sample_count"] or 0), bool(profile.get("ml_enabled", False)), profile.get("updated_at"))
        confidence = _baseline_confidence(maturity)

        statistical_score, statistical_reasons, statistical_categories = _score_statistical(profile, features)
        ml_result = score_isolation_forest(profile.get("ml_model"), features) if bool(profile.get("ml_enabled", False)) else {
            "ml_model_available": False,
            "ml_anomaly_score": 0,
            "ml_reasons": ["Isolation Forest model is not enabled for this profile."],
            "ml_details": {},
        }

        ml_score = int(ml_result.get("ml_anomaly_score", 0) or 0)
        score = max(statistical_score, ml_score)
        if statistical_score >= 40 and ml_score >= 40:
            score = min(100, score + 10)
        if confidence == "LOW":
            score = min(score, 49)
        elif confidence == "MEDIUM":
            score = min(score, 74)

        reasons = []
        reasons.extend(statistical_reasons)
        if ml_result.get("ml_model_available"):
            reasons.extend(ml_result.get("ml_reasons", []))
        elif ml_result.get("ml_reasons") and statistical_score == 0:
            reasons.extend(ml_result.get("ml_reasons", []))
        if confidence == "LOW":
            reasons.append("Baseline maturity is low, so anomaly confidence is capped for safer production behavior.")
        elif confidence == "MEDIUM":
            reasons.append("Baseline is still stabilizing, so anomaly confidence is limited.")
        if not reasons:
            reasons.append("Query is consistent with the learned statistical and ML baseline.")

        category = _select_category(statistical_categories, statistical_score, ml_score, bool(ml_result.get("ml_model_available")))
        result = {
            "query_id": query_id,
            "db_user": db_user,
            "anomaly_score": max(0, min(100, score)),
            "statistical_score": statistical_score,
            "ml_anomaly_score": ml_score,
            "anomaly_category": category,
            "baseline_maturity": maturity,
            "anomaly_confidence": confidence,
            "anomaly_reasons": reasons,
            "baseline_available": True,
            "ml_model_available": bool(ml_result.get("ml_model_available")),
            "model_version": MODEL_VERSION if ml_result.get("ml_model_available") else STATISTICAL_MODEL_VERSION,
        }
        await _save_anomaly_score_with_repo(anomaly_repo, result)
        return result

def _score_statistical(profile: Any, features: dict[str, Any]) -> tuple[int, list[str], set[str]]:
    score = 0
    reasons: list[str] = []
    categories: set[str] = set()

    common_tables = set(profile["common_tables"] or [])
    query_tables = set(features["table_names"] or [])

    query_type_distribution = _as_json_mapping(profile["query_type_distribution"])

    if features["query_type"] not in query_type_distribution:
        score += 25
        categories.add("QUERY_SHAPE")
        reasons.append(f"Unusual query type for user: {features['query_type']}")

    unseen_tables = sorted(query_tables.difference(common_tables))
    if unseen_tables:
        score += min(30, 15 * len(unseen_tables))
        categories.add("TABLE_ACCESS")
        reasons.append(f"Accessed table(s) outside baseline: {', '.join(unseen_tables)}")

    if int(features["sensitive_table_count"]) > _as_float(profile["avg_sensitive_table_count"]):
        score += 20
        categories.add("SENSITIVE_DATA")
        reasons.append("Sensitive-table access is higher than user baseline.")

    if features["has_select_star"] and _as_float(profile["avg_has_select_star"]) < 0.4:
        score += 15
        categories.add("QUERY_SHAPE")
        reasons.append("SELECT * is uncommon for this user baseline.")

    if not features["has_limit"] and _as_float(profile["avg_has_limit"]) > 0.6:
        score += 10
        categories.add("QUERY_SHAPE")
        reasons.append("Query is missing LIMIT while the user baseline commonly uses LIMIT.")

    if int(features["where_condition_count"]) > _as_float(profile["avg_where_conditions"]) + 2:
        score += 10
        categories.add("QUERY_SHAPE")
        reasons.append("WHERE clause complexity is above baseline.")

    normal_hours = set(profile["normal_hours"] or [])
    if normal_hours and int(features["hour_of_day"]) not in normal_hours:
        score += 10
        categories.add("TIME")
        reasons.append("Query executed outside the user's learned normal hours.")

    score = max(0, min(100, score))
    if not reasons:
        reasons.append("Statistical baseline check is consistent with learned behavior.")

    return score, reasons, categories


def _select_category(categories: set[str], statistical_score: int, ml_score: int, ml_available: bool) -> str:
    if "SENSITIVE_DATA" in categories:
        return "SENSITIVE_DATA_ANOMALY"
    if "TABLE_ACCESS" in categories:
        return "TABLE_ACCESS_ANOMALY"
    if "TIME" in categories:
        return "TIME_ANOMALY"
    if "QUERY_SHAPE" in categories:
        return "QUERY_SHAPE_ANOMALY"
    if ml_available and ml_score >= 70:
        return "ML_OUTLIER"
    if ml_available and ml_score >= 40:
        return "ML_ELEVATED"
    if statistical_score >= 40:
        return "BEHAVIORAL_ANOMALY"
    return "NORMAL"


async def get_baseline_profiles() -> list[dict[str, Any]]:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        records = await BaselineRepo(conn).get_all()
    profiles: list[dict[str, Any]] = []
    for record in records:
        item = _profile_record_to_mapping(record)
        item.pop("ml_model", None)
        item["query_type_distribution"] = _as_json_mapping(item.get("query_type_distribution"))
        item["ml_feature_schema"] = _as_json_mapping(item.get("ml_feature_schema"))
        item["baseline_maturity"] = _baseline_maturity(int(item.get("sample_count") or 0), bool(item.get("ml_enabled")), item.get("updated_at"))
        item["baseline_confidence"] = _baseline_confidence(item["baseline_maturity"])
        profiles.append(item)
    return profiles

async def get_recent_anomaly_scores(limit: int = 50) -> list[dict[str, Any]]:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        records = await AnomalyRepo(conn).get_many(limit, 0)
    return [asdict(record) for record in records]

async def _get_users_with_logs() -> list[str]:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        return await QueryLogRepo(conn).get_distinct_db_users()

def _baseline_maturity(sample_count: int, ml_enabled: bool, updated_at: Any | None = None) -> str:
    if updated_at:
        try:
            if isinstance(updated_at, str):
                updated_dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            else:
                updated_dt = updated_at
            if updated_dt.tzinfo is None:
                updated_dt = updated_dt.replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - updated_dt).days
            if age_days > STALE_BASELINE_DAYS and sample_count >= STABLE_BASELINE_SAMPLES:
                return "STALE_ML" if ml_enabled else "STALE"
        except Exception:
            pass

    if sample_count < MIN_BASELINE_SAMPLES:
        return "COLD"
    if sample_count < STABLE_BASELINE_SAMPLES:
        return "LEARNING_ML" if ml_enabled else "LEARNING"
    if sample_count < MATURE_BASELINE_SAMPLES:
        return "STABLE_ML" if ml_enabled else "STABLE"
    return "MATURE_ML" if ml_enabled else "MATURE"


def _baseline_confidence(maturity: str) -> str:
    if maturity in {"MATURE", "MATURE_ML", "STABLE", "STABLE_ML"}:
        return "HIGH"
    if maturity in {"LEARNING", "LEARNING_ML", "STALE", "STALE_ML"}:
        return "MEDIUM"
    return "LOW"


def _build_profile(db_user: str, features: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(features)
    query_types = Counter(item["query_type"] for item in features)
    table_counter = Counter()
    hour_counter = Counter()

    for item in features:
        table_counter.update(item["table_names"])
        hour_counter.update([item["hour_of_day"]])

    common_tables = [table for table, freq in table_counter.items() if freq >= max(1, count * 0.2)]
    normal_hours = [hour for hour, freq in hour_counter.items() if freq >= max(1, count * 0.2)]

    return {
        "db_user": db_user,
        "sample_count": count,
        "query_type_distribution": dict(query_types),
        "common_tables": sorted(common_tables),
        "avg_table_count": sum(item["table_count"] for item in features) / count,
        "avg_where_conditions": sum(item["where_condition_count"] for item in features) / count,
        "avg_has_limit": sum(1 if item["has_limit"] else 0 for item in features) / count,
        "avg_has_select_star": sum(1 if item["has_select_star"] else 0 for item in features) / count,
        "avg_sensitive_table_count": sum(item["sensitive_table_count"] for item in features) / count,
        "avg_risk_score": sum(item["risk_score"] for item in features) / count,
        "normal_hours": sorted(normal_hours),
        "model_version": MODEL_VERSION,
    }


async def _save_profile(profile: dict[str, Any]) -> None:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        await _save_profile_with_repo(BaselineRepo(conn), profile)


def _profile_record_to_mapping(record: BaselineProfileRecord) -> dict[str, Any]:
    return asdict(record)


async def _save_profile_with_repo(repo: BaselineRepo, profile: dict[str, Any]) -> None:
    record = BaselineProfileRecord(
        profile_id=None,
        db_user=profile["db_user"],
        sample_count=int(profile["sample_count"]),
        query_type_distribution=profile.get("query_type_distribution") or {},
        common_tables=profile.get("common_tables") or [],
        avg_table_count=float(profile.get("avg_table_count") or 0),
        avg_where_conditions=float(profile.get("avg_where_conditions") or 0),
        avg_has_limit=float(profile.get("avg_has_limit") or 0),
        avg_has_select_star=float(profile.get("avg_has_select_star") or 0),
        avg_sensitive_table_count=float(profile.get("avg_sensitive_table_count") or 0),
        avg_risk_score=float(profile.get("avg_risk_score") or 0),
        normal_hours=profile.get("normal_hours") or [],
        model_version=profile.get("model_version"),
        ml_enabled=bool(profile.get("ml_enabled", False)),
        ml_algorithm=profile.get("ml_algorithm", ML_ALGORITHM),
        ml_model=profile.get("ml_model"),
        ml_feature_schema=profile.get("ml_feature_schema") or {},
        ml_training_error=profile.get("ml_training_error"),
        updated_at=None,
    )
    await repo.upsert(record)

async def _save_anomaly_score(result: dict[str, Any]) -> None:
    pool = get_control_pool()
    async with pool.acquire() as conn:
        await _save_anomaly_score_with_repo(AnomalyRepo(conn), result)


async def _save_anomaly_score_with_repo(repo: AnomalyRepo, result: dict[str, Any]) -> None:
    await repo.insert(
        int(result["query_id"]),
        result.get("db_user"),
        int(result["anomaly_score"]),
        list(result.get("anomaly_reasons") or []),
        bool(result.get("baseline_available", False)),
        int(result.get("statistical_score", 0)),
        int(result.get("ml_anomaly_score", 0)),
        str(result.get("anomaly_category", "NORMAL")),
        str(result.get("baseline_maturity", "UNKNOWN")),
        str(result.get("anomaly_confidence", "UNKNOWN")),
        bool(result.get("ml_model_available", False)),
        str(result.get("model_version", STATISTICAL_MODEL_VERSION)),
    )

