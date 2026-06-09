from __future__ import annotations

import json
import sys
from typing import Any, Literal
from urllib.parse import quote

from pydantic import Field, PostgresDsn, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    sqlwatcher_database_url: PostgresDsn = Field(alias="SQLWATCHER_DATABASE_URL")
    target_database_url: PostgresDsn = Field(alias="TARGET_DATABASE_URL")
    frontend_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"], alias="FRONTEND_ORIGINS")
    session_ttl_hours: int = Field(default=8, alias="SESSION_TTL_HOURS")
    sqlwatcher_proxy_token: str = Field(alias="SQLWATCHER_PROXY_TOKEN")
    realtime_sync_min_interval_seconds: float = Field(default=2.0, alias="REALTIME_SYNC_MIN_INTERVAL_SECONDS")
    realtime_sync_batch_size: int = Field(default=75, alias="REALTIME_SYNC_BATCH_SIZE")
    log_format: Literal["json", "console"] = Field(default="console", alias="LOG_FORMAT")
    environment: Literal["development", "production"] = Field(default="development", alias="ENVIRONMENT")
    control_db_pool_min_size: int = Field(default=3, alias="CONTROL_DB_POOL_MIN_SIZE")
    control_db_pool_max_size: int = Field(default=20, alias="CONTROL_DB_POOL_MAX_SIZE")
    target_db_pool_min_size: int = Field(default=3, alias="TARGET_DB_POOL_MIN_SIZE")
    target_db_pool_max_size: int = Field(default=20, alias="TARGET_DB_POOL_MAX_SIZE")
    db_pool_max_inactive_connection_lifetime: float = Field(default=300.0, alias="DB_POOL_MAX_INACTIVE_CONNECTION_LIFETIME")

    @model_validator(mode="before")
    @classmethod
    def derive_database_urls_from_neon_parts(cls, data: Any) -> Any:
        """Derive required database URLs from the single local .env Neon fields.

        Docker Compose passes explicit SQLWATCHER_DATABASE_URL and TARGET_DATABASE_URL,
        but local/dev imports read .env directly. To keep one editable config file,
        derive those URLs when the Neon component fields are present.
        """
        if not isinstance(data, dict):
            return data

        def get(name: str) -> str | None:
            value = data.get(name) or data.get(name.lower())
            return str(value).strip() if value is not None and str(value).strip() else None

        host = get("NEON_HOST")
        port = get("NEON_PORT") or "5432"
        sslmode = get("NEON_SSLMODE") or "require"

        sqlwatcher_db = get("SQLWATCHER_DB_NAME") or get("NEON_SQLWATCHER_DATABASE") or "sqlwatcher"
        sqlwatcher_user = get("SQLWATCHER_DB_USER") or get("NEON_SQLWATCHER_USER")
        sqlwatcher_password = get("SQLWATCHER_DB_PASSWORD") or get("NEON_SQLWATCHER_PASSWORD")

        secureshop_db = get("SECURESHOP_DB_NAME") or get("NEON_DATABASE") or "secureshop"
        secureshop_app_user = get("SECURESHOP_DB_USER")
        secureshop_app_password = get("SECURESHOP_DB_PASSWORD")

        def build_url(database: str | None, user: str | None, password: str | None) -> str | None:
            if not all([host, database, user, password]):
                return None
            safe_user = quote(str(user), safe="")
            safe_password = quote(str(password), safe="")
            return f"postgresql://{safe_user}:{safe_password}@{host}:{port}/{database}?sslmode={sslmode}"

        if not get("SQLWATCHER_DATABASE_URL"):
            control_url = build_url(sqlwatcher_db, sqlwatcher_user, sqlwatcher_password)
            if control_url:
                data["SQLWATCHER_DATABASE_URL"] = control_url
        if not get("TARGET_DATABASE_URL"):
            target_url = build_url(secureshop_db, secureshop_app_user, secureshop_app_password)
            if target_url:
                data["TARGET_DATABASE_URL"] = target_url
        return data

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_frontend_origins(cls, value: object) -> list[str]:
        if value is None or value == "":
            return ["http://localhost:5173"]
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return ["http://localhost:5173"]
            if raw.startswith("["):
                try:
                    decoded = json.loads(raw)
                    if isinstance(decoded, list):
                        return [str(origin).strip() for origin in decoded if str(origin).strip()] or ["http://localhost:5173"]
                except json.JSONDecodeError:
                    pass
            origins = [origin.strip().strip('\"\'') for origin in raw.split(",") if origin.strip().strip('\"\'')]
            return origins or ["http://localhost:5173"]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        raise TypeError("FRONTEND_ORIGINS must be a comma-separated string, JSON array, or list of strings.")

    @field_validator("sqlwatcher_proxy_token")
    @classmethod
    def validate_proxy_token(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("SQLWATCHER_PROXY_TOKEN must be set to a non-empty strong token.")
        if value == "change-this" + "-proxy-token":
            raise ValueError("SQLWATCHER_PROXY_TOKEN must not use the old insecure default value.")
        return value


try:
    settings = Settings()
except ValidationError as exc:
    sys.stderr.write(
        "SQLWatcher configuration error: required environment variables are missing or invalid. "
        "Set SQLWATCHER_DATABASE_URL, TARGET_DATABASE_URL, and SQLWATCHER_PROXY_TOKEN before startup.\n"
    )
    raise

# Compatibility constants for modules that have not yet been refactored to read
# directly from the Settings singleton. Imports are moved to app.core.config in
# this phase; these names are removed in the final cleanup phase.
SQLWATCHER_DATABASE_URL = str(settings.sqlwatcher_database_url)
APP_DATABASE_URL = SQLWATCHER_DATABASE_URL
TARGET_DATABASE_URL = str(settings.target_database_url)
FRONTEND_ORIGINS = settings.frontend_origins
SESSION_TTL_HOURS = settings.session_ttl_hours
SQLWATCHER_PROXY_TOKEN = settings.sqlwatcher_proxy_token
REALTIME_SYNC_MIN_INTERVAL_SECONDS = settings.realtime_sync_min_interval_seconds
REALTIME_SYNC_BATCH_SIZE = settings.realtime_sync_batch_size
LOG_FORMAT = settings.log_format
ENVIRONMENT = settings.environment
CONTROL_DB_POOL_MIN_SIZE = settings.control_db_pool_min_size
CONTROL_DB_POOL_MAX_SIZE = settings.control_db_pool_max_size
TARGET_DB_POOL_MIN_SIZE = settings.target_db_pool_min_size
TARGET_DB_POOL_MAX_SIZE = settings.target_db_pool_max_size
DB_POOL_MAX_INACTIVE_CONNECTION_LIFETIME = settings.db_pool_max_inactive_connection_lifetime
