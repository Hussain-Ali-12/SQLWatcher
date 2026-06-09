from __future__ import annotations

from io import BytesIO
import math
from typing import Any

try:
    import joblib
    import numpy as np
    from sklearn.ensemble import IsolationForest
    from sklearn.feature_extraction import DictVectorizer
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    SKLEARN_AVAILABLE = True
except Exception as exc:  # pragma: no cover
    joblib = None
    np = None
    IsolationForest = None
    DictVectorizer = None
    Pipeline = None
    StandardScaler = None
    SKLEARN_AVAILABLE = False
    SKLEARN_IMPORT_ERROR = str(exc)

ML_ALGORITHM = "IsolationForest"
ML_MODEL_VERSION = "hybrid-statistical-iforest-v1"
MIN_ML_SAMPLES = 5


def serialize_model_bundle(bundle: dict[str, Any]) -> bytes:
    """Serialize a trained sklearn model bundle with joblib.

    joblib is the recommended persistence utility for scikit-learn estimators and
    numpy-heavy pipelines. The returned bytes are stored in PostgreSQL BYTEA.
    """
    buffer = BytesIO()
    joblib.dump(bundle, buffer)
    return buffer.getvalue()


def deserialize_model_bundle(model_blob: bytes | memoryview) -> dict[str, Any]:
    """Load a trained sklearn model bundle from PostgreSQL BYTEA bytes."""
    buffer = BytesIO(bytes(model_blob))
    bundle = joblib.load(buffer)
    if not isinstance(bundle, dict):
        raise ValueError("Stored ML model bundle is invalid.")
    return bundle


def vectorize_query_features(features: dict[str, Any]) -> dict[str, float | int]:
    vector: dict[str, float | int] = {
        "table_count": float(features.get("table_count") or 0),
        "sensitive_table_count": float(features.get("sensitive_table_count") or 0),
        "where_condition_count": float(features.get("where_condition_count") or 0),
        "keyword_count": float(features.get("keyword_count") or 0),
        "has_select_star": 1 if features.get("has_select_star") else 0,
        "has_limit": 1 if features.get("has_limit") else 0,
    }

    hour = int(features.get("hour_of_day") or 0)
    vector["hour_sin"] = math.sin((2 * math.pi * hour) / 24)
    vector["hour_cos"] = math.cos((2 * math.pi * hour) / 24)

    query_type = str(features.get("query_type") or "UNKNOWN").upper()
    vector[f"query_type={query_type}"] = 1

    for table in features.get("table_names") or []:
        cleaned = str(table).lower().strip()
        if cleaned:
            vector[f"table={cleaned}"] = 1

    return vector


def train_isolation_forest(feature_rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not SKLEARN_AVAILABLE:
        return {
            "ml_enabled": False,
            "ml_model_blob": None,
            "ml_feature_schema": {
                "algorithm": ML_ALGORITHM,
                "available": False,
                "error": globals().get("SKLEARN_IMPORT_ERROR", "scikit-learn is not available."),
            },
            "ml_training_error": "scikit-learn/numpy/joblib dependencies are not installed.",
        }

    if len(feature_rows) < MIN_ML_SAMPLES:
        return {
            "ml_enabled": False,
            "ml_model_blob": None,
            "ml_feature_schema": {
                "algorithm": ML_ALGORITHM,
                "available": False,
                "minimum_samples": MIN_ML_SAMPLES,
                "actual_samples": len(feature_rows),
            },
            "ml_training_error": f"Need at least {MIN_ML_SAMPLES} samples to train Isolation Forest.",
        }

    vectors = [vectorize_query_features(row) for row in feature_rows]
    pipeline = Pipeline(
        steps=[
            ("vectorizer", DictVectorizer(sparse=True)),
            ("scaler", StandardScaler(with_mean=False)),
            ("model", IsolationForest(
                n_estimators=120,
                contamination="auto",
                random_state=42,
                bootstrap=False,
            )),
        ]
    )
    pipeline.fit(vectors)

    train_decisions = pipeline.decision_function(vectors)
    decision_median = float(np.median(train_decisions))
    decision_std = float(np.std(train_decisions) or 0.01)
    decision_min = float(np.min(train_decisions))
    decision_max = float(np.max(train_decisions))
    decision_p01 = float(np.percentile(train_decisions, 1))
    decision_p05 = float(np.percentile(train_decisions, 5))
    decision_p10 = float(np.percentile(train_decisions, 10))
    decision_p25 = float(np.percentile(train_decisions, 25))

    bundle = {
        "algorithm": ML_ALGORITHM,
        "model_version": ML_MODEL_VERSION,
        "pipeline": pipeline,
        "decision_median": decision_median,
        "decision_std": decision_std,
        "decision_min": decision_min,
        "decision_max": decision_max,
        "decision_p01": decision_p01,
        "decision_p05": decision_p05,
        "decision_p10": decision_p10,
        "decision_p25": decision_p25,
        "sample_count": len(feature_rows),
    }

    feature_names = []
    try:
        feature_names = list(pipeline.named_steps["vectorizer"].get_feature_names_out())
    except Exception:
        feature_names = []

    return {
        "ml_enabled": True,
        "ml_model_blob": serialize_model_bundle(bundle),
        "ml_feature_schema": {
            "algorithm": ML_ALGORITHM,
            "model_version": ML_MODEL_VERSION,
            "feature_count": len(feature_names),
            "feature_names": feature_names[:80],
            "training_samples": len(feature_rows),
            "decision_median": decision_median,
            "decision_std": decision_std,
            "decision_min": decision_min,
            "decision_max": decision_max,
            "decision_p01": decision_p01,
            "decision_p05": decision_p05,
            "decision_p10": decision_p10,
            "decision_p25": decision_p25,
        },
        "ml_training_error": None,
    }


def score_isolation_forest(model_blob: bytes | memoryview | None, features: dict[str, Any]) -> dict[str, Any]:
    if not model_blob:
        return {
            "ml_model_available": False,
            "ml_anomaly_score": 0,
            "ml_reasons": ["Isolation Forest model is not trained for this baseline."],
            "ml_details": {},
        }

    try:
        bundle = deserialize_model_bundle(model_blob)
        pipeline = bundle["pipeline"]
        vector = vectorize_query_features(features)
        decision = float(pipeline.decision_function([vector])[0])
        prediction = int(pipeline.predict([vector])[0])

        median = float(bundle.get("decision_median", 0.0))
        std = max(float(bundle.get("decision_std", 0.01)), 0.01)
        p01 = float(bundle.get("decision_p01", bundle.get("decision_min", median)))
        p05 = float(bundle.get("decision_p05", bundle.get("decision_min", median)))
        p10 = float(bundle.get("decision_p10", median))
        p25 = float(bundle.get("decision_p25", median))

        # Lower IsolationForest decision scores are more anomalous.
        # Prefer per-profile training percentiles over one generic threshold.
        if decision <= p01:
            score = 95
        elif decision <= p05:
            score = 85
        elif decision <= p10:
            score = 70
        elif decision <= p25:
            score = 45
        else:
            z_distance = max(0.0, (median - decision) / std)
            score = int(round(min(35, z_distance * 15)))

        if prediction == -1:
            score = max(score, 70)

        reasons = []
        if prediction == -1:
            reasons.append("Isolation Forest marked this query as an outlier for this user baseline.")
        if decision <= p01:
            reasons.append("ML score is beyond the profile's p01 training boundary.")
        elif decision <= p05:
            reasons.append("ML score is beyond the profile's p05 training boundary.")
        elif decision <= p10:
            reasons.append("ML score is beyond the profile's p10 training boundary.")
        elif decision <= p25:
            reasons.append("ML score is below the lower quartile of learned normal traffic.")
        elif not reasons:
            reasons.append("Isolation Forest score is within the learned normal range.")

        return {
            "ml_model_available": True,
            "ml_anomaly_score": max(0, min(100, score)),
            "ml_reasons": reasons,
            "ml_details": {
                "algorithm": ML_ALGORITHM,
                "model_version": ML_MODEL_VERSION,
                "decision_function": round(decision, 6),
                "training_median": round(median, 6),
                "training_std": round(std, 6),
                "training_p01": round(p01, 6),
                "training_p05": round(p05, 6),
                "training_p10": round(p10, 6),
                "training_p25": round(p25, 6),
                "prediction": prediction,
            },
        }
    except Exception as exc:
        return {
            "ml_model_available": False,
            "ml_anomaly_score": 0,
            "ml_reasons": [f"Isolation Forest scoring failed: {exc}"],
            "ml_details": {"error": str(exc)},
        }
