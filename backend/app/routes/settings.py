from __future__ import annotations

import os
from time import perf_counter
from urllib.parse import quote, urlparse, parse_qs

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.config import FRONTEND_ORIGINS, settings
from app.dependencies.auth import get_current_user, require_roles
from app.dependencies.db import Repos, get_repos
from app.services.anomaly_policy import get_anomaly_policy, save_anomaly_policy
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/system", tags=["Settings"])


class AnomalyConfigPayload(BaseModel):
    enabled: bool = True
    enforcement_mode: str = Field(default="flag")
    min_score: int = Field(default=70, ge=1, le=100)


class DeploymentConfigPayload(BaseModel):
    proxy_address_mode: str | None = None
    public_proxy_host: str | None = None
    public_proxy_port: int | None = None
    public_proxy_database: str | None = None
    public_proxy_username: str | None = None
    protected_database_url: str | None = None
    deployment_notes: str | None = None


def _env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return default


def mask_url(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return url
    username = parsed.username or ""
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    auth = f"{username}:********@" if username else ""
    return f"{parsed.scheme}://{auth}{host}{port}{parsed.path or ''}{('?' + parsed.query) if parsed.query else ''}"


def parse_url(url: str) -> dict:
    parsed = urlparse(url)
    query = parse_qs(parsed.query or "")
    return {
        "scheme": parsed.scheme,
        "username": parsed.username,
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "database": (parsed.path or "").lstrip("/"),
        "sslmode": query.get("sslmode", [""])[0],
        "masked_url": mask_url(url),
    }


def current_target_info() -> dict:
    runtime_target_url = str(settings.target_database_url)
    return {
        "target_host": os.getenv("PROXY_TARGET_HOST", os.getenv("CLOUD_DB_HOST", "target-db")),
        "target_port": int(os.getenv("PROXY_TARGET_PORT", os.getenv("CLOUD_DB_PORT", "5432"))),
        "target_ssl_mode": os.getenv("PROXY_TARGET_SSL_MODE", "disable"),
        "runtime_url": parse_url(runtime_target_url) if runtime_target_url else {},
    }


def build_proxy_connection_info(config: dict, target_info: dict) -> dict:
    listen_port = int(os.getenv("PROXY_LISTEN_PORT", "15432"))
    public_host = config.get("public_proxy_host", {}).get("value") or _env("SQLWATCHER_PUBLIC_PROXY_HOST", "PROXY_PUBLIC_HOST", default="localhost")
    public_port = int(config.get("public_proxy_port", {}).get("value") or _env("SQLWATCHER_PUBLIC_PROXY_PORT", "PROXY_PUBLIC_PORT", default=str(listen_port)))
    database = config.get("public_proxy_database", {}).get("value") or target_info.get("database") or "appdb"
    username = config.get("public_proxy_username", {}).get("value") or target_info.get("username") or "appuser"
    sslmode = _env("CLIENT_PROXY_SSL_MODE", default="disable")
    proxy_url = f"postgresql://{quote(username, safe='')}:<password>@{public_host}:{public_port}/{database}?sslmode={sslmode}"
    return {
        "public_host": public_host,
        "public_port": public_port,
        "database": database,
        "username": username,
        "sslmode": sslmode,
        "proxy_url_template": proxy_url,
        "copy_safe_proxy_url": proxy_url,
        "note": "Give this proxy URL to the application deployment team as DATABASE_URL. Replace <password> with the application database password.",
    }


def build_integration_snippets(proxy_info: dict, target_info: dict) -> dict:
    return {
        "production_env": f"DATABASE_URL={proxy_info['proxy_url_template']}",
        "direct_database_env": f"DIRECT_DATABASE_URL={target_info.get('masked_url', '')}",
        "client_application_env": "\n".join([f"DIRECT_DATABASE_URL={target_info.get('masked_url', '')}", f"SQLWATCHER_PROXY_DATABASE_URL={proxy_info['proxy_url_template']}", "DEFAULT_CONNECTION_MODE=proxy"]),
        "docker_compose_env": "\n".join(["PROXY_TARGET_HOST=<protected-db-host>", "PROXY_TARGET_PORT=5432", "PROXY_TARGET_SSL_MODE=require", f"SQLWATCHER_PUBLIC_PROXY_HOST={proxy_info['public_host']}", f"SQLWATCHER_PUBLIC_PROXY_PORT={proxy_info['public_port']}"]),
        "production_note": "In production, a client application normally has one DATABASE_URL pointing to SQLWatcher Proxy.",
    }


@router.get("/connection-config")
async def connection_config(current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    deployment_config = await repos.config.get_all()
    target = current_target_info()
    runtime_target_info = target["runtime_url"] or {"username": "appuser", "host": target["target_host"], "port": target["target_port"], "database": "appdb", "sslmode": target["target_ssl_mode"], "masked_url": ""}
    proxy_info = build_proxy_connection_info(deployment_config, runtime_target_info)
    anomaly_policy = await get_anomaly_policy()
    return {
        "control_plane": {
            "sqlwatcher_api": _env("SQLWATCHER_PUBLIC_API_URL", default="http://backend:8000/api"),
            "dashboard": _env("SQLWATCHER_PUBLIC_DASHBOARD_URL", default="http://localhost:5173"),
            "control_db": parse_url(str(settings.sqlwatcher_database_url)),
            "control_db_editing": "Read-only from dashboard. Change through deployment secrets/env variables.",
            "frontend_origins": FRONTEND_ORIGINS,
        },
        "data_plane": {
            "proxy_listen_host": os.getenv("PROXY_LISTEN_HOST", "0.0.0.0"),
            "proxy_listen_port": int(os.getenv("PROXY_LISTEN_PORT", "15432")),
            "target_host": target["target_host"],
            "target_port": target["target_port"],
            "target_ssl_mode": target["target_ssl_mode"],
            "fast_local_detection": os.getenv("PROXY_FAST_LOCAL_DETECTION", "true"),
            "background_recording": os.getenv("PROXY_BACKGROUND_RECORDING", "true"),
            "runtime_target": runtime_target_info,
        },
        "proxy_connection": proxy_info,
        "client_integration": build_integration_snippets(proxy_info, runtime_target_info),
        "anomaly_detection": anomaly_policy,
        "deployment_config": deployment_config,
        "connection_paths": {"direct": "Client Application -> Protected PostgreSQL", "protected": "Client Application -> SQLWatcher Proxy -> Protected PostgreSQL", "production": "Client Application -> SQLWatcher Proxy -> Protected PostgreSQL"},
        "runtime_editing_note": "Dashboard saves deployment configuration drafts. Runtime target changes require redeploy/restart.",
    }


@router.get("/anomaly-config")
async def anomaly_config(current_user: dict = Depends(get_current_user)):
    return await get_anomaly_policy(force_refresh=True)


@router.post("/anomaly-config")
async def update_anomaly_config(payload: AnomalyConfigPayload, current_user: dict = Depends(require_roles("admin")), repos: Repos = Depends(get_repos)):
    policy = await save_anomaly_policy(payload.enabled, payload.enforcement_mode, payload.min_score)
    await AuditService(repos.audit).log("ANOMALY_CONFIG_UPDATED", f"Anomaly detection {'enabled' if policy['enabled'] else 'disabled'} with mode {policy['enforcement_mode']} and threshold {policy['min_score']}.", actor=current_user, entity_type="system_config", metadata=policy)
    return policy


@router.get("/deployment-config")
async def deployment_config(current_user: dict = Depends(get_current_user), repos: Repos = Depends(get_repos)):
    config = await repos.config.get_all()
    target = current_target_info()
    runtime_target_info = target["runtime_url"] or {"username": "appuser", "host": target["target_host"], "port": target["target_port"], "database": "appdb", "sslmode": target["target_ssl_mode"], "masked_url": ""}
    proxy_info = build_proxy_connection_info(config, runtime_target_info)
    return {"config": config, "proxy_connection": proxy_info, "client_integration": build_integration_snippets(proxy_info, runtime_target_info), "control_db_policy": "SQLWatcher control/logs database is read-only from dashboard and should be managed through deployment secrets.", "target_db_policy": "Protected database target can be drafted and tested here, then applied through deployment environment variables/restart."}


@router.post("/deployment-config")
async def save_deployment_config(payload: DeploymentConfigPayload, current_user: dict = Depends(require_roles("admin")), repos: Repos = Depends(get_repos)):
    values = {
        "proxy_address_mode": payload.proxy_address_mode,
        "public_proxy_host": payload.public_proxy_host,
        "public_proxy_port": str(payload.public_proxy_port) if payload.public_proxy_port is not None else None,
        "public_proxy_database": payload.public_proxy_database,
        "public_proxy_username": payload.public_proxy_username,
        "deployment_notes": payload.deployment_notes,
    }
    for key, value in values.items():
        if value is not None:
            await repos.config.upsert(key, value, False)
    parsed_target = None
    if payload.protected_database_url:
        parsed_target = parse_url(payload.protected_database_url)
        for key, value in {
            "protected_database_url_masked": parsed_target.get("masked_url", ""),
            "protected_database_host": parsed_target.get("host", ""),
            "protected_database_port": str(parsed_target.get("port") or 5432),
            "protected_database_name": parsed_target.get("database", ""),
            "protected_database_sslmode": parsed_target.get("sslmode", ""),
        }.items():
            await repos.config.upsert(key, value, False)
    await AuditService(repos.audit).log("DEPLOYMENT_CONFIG_UPDATED", "Deployment connection configuration draft was updated.", actor=current_user, entity_type="deployment_config", metadata={"protected_database": parsed_target.get("masked_url") if parsed_target else None})
    updated_config = await repos.config.get_all()
    target = current_target_info()
    runtime_target_info = target["runtime_url"] or {"username": "appuser", "host": target["target_host"], "port": target["target_port"], "database": "appdb", "sslmode": target["target_ssl_mode"], "masked_url": ""}
    proxy_info = build_proxy_connection_info(updated_config, runtime_target_info)
    return {"status": "saved", "restart_required": True, "message": "Deployment draft saved. Apply real proxy target changes through deployment secrets/environment variables and restart/redeploy the proxy.", "deployment_config": updated_config, "proxy_connection": proxy_info, "client_integration": build_integration_snippets(proxy_info, runtime_target_info)}
