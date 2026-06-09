from __future__ import annotations

import io
from typing import Any

import joblib

from app.ml.baseline_model import get_baseline_profiles, train_baseline


def serialise_model(pipeline: Any) -> bytes:
    buf = io.BytesIO()
    joblib.dump(pipeline, buf, compress=3)
    return buf.getvalue()


def deserialise_model(data: bytes):
    return joblib.load(io.BytesIO(data))


class MLService:
    async def get_model_health(self) -> dict[str, Any]:
        profiles = await get_baseline_profiles()
        return {
            "profiles": [
                {
                    "db_user": profile.get("db_user"),
                    "sample_count": profile.get("sample_count", 0),
                    "ml_enabled": profile.get("ml_enabled", False),
                    "baseline_maturity": profile.get("baseline_maturity"),
                    "baseline_confidence": profile.get("baseline_confidence"),
                    "model_version": profile.get("model_version"),
                    "training_error": profile.get("ml_training_error"),
                }
                for profile in profiles
            ]
        }

    async def retrain(self, db_user: str | None = None, includes_allows_only: bool = True) -> dict[str, Any]:
        return await train_baseline(db_user=db_user, include_allows_only=includes_allows_only)
