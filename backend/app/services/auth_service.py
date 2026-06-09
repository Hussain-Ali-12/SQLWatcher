from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings
from app.core.database import get_control_pool
from app.models.records import UserRecord
from app.repos.audit_repo import AuditRepo
from app.repos.session_repo import SessionRepo
from app.repos.user_repo import UserRepo

PBKDF2_ITERATIONS = 150_000



def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${derived}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations),
        ).hex()
        return hmac.compare_digest(derived, expected)
    except Exception:
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _public_user(user: UserRecord) -> dict[str, Any]:
    return {
        "user_id": user.user_id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
    }


class AuthService:
    def __init__(self, user_repo: UserRepo, session_repo: SessionRepo, audit_repo: AuditRepo | None = None) -> None:
        self.user_repo = user_repo
        self.session_repo = session_repo
        self.audit_repo = audit_repo

    async def authenticate_user(self, username: str, password: str) -> dict[str, Any] | None:
        user = await self.user_repo.get_by_username(username.lower().strip())
        if user is None or not user.is_active or not user.password_hash:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return _public_user(user)

    async def create_session(self, user: dict[str, Any]) -> dict[str, Any]:
        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.session_ttl_hours)
        await self.session_repo.insert(token_hash, int(user["user_id"]), expires_at)
        if self.audit_repo is not None:
            await self.audit_repo.insert(
                "AUTH_LOGIN",
                f"{user['username']} logged in.",
                actor_id=int(user["user_id"]),
                actor_email=str(user.get("username") or user.get("email")),
                actor_role=str(user.get("role")),
                entity_type="auth_session",
                entity_id=int(user["user_id"]),
                metadata={},
            )
        return {"token": token, "expires_at": expires_at.isoformat()}

    async def get_user_by_token(self, token: str) -> dict[str, Any] | None:
        session = await self.session_repo.get_active_by_token_hash(_hash_token(token))
        if session is None or session.user is None:
            return None
        return _public_user(session.user)

    async def revoke_session(self, token: str, actor: dict[str, Any] | None = None) -> None:
        await self.session_repo.revoke(_hash_token(token))
        if actor and self.audit_repo is not None:
            await self.audit_repo.insert(
                "AUTH_LOGOUT",
                f"{actor.get('username', actor.get('email'))} logged out.",
                actor_id=int(actor["user_id"]),
                actor_email=str(actor.get("username") or actor.get("email")),
                actor_role=str(actor.get("role")),
                entity_type="auth_session",
                entity_id=int(actor["user_id"]),
                metadata={},
            )


async def _with_auth_service() -> AuthService:  # pragma: no cover - legacy compatibility wrapper
    pool = get_control_pool()
    conn = await pool.acquire()
    try:
        # The service owns only repo calls; compatibility wrappers acquire route-independent connections.
        return AuthService(UserRepo(conn), SessionRepo(conn), AuditRepo(conn))
    finally:
        await pool.release(conn)


async def seed_default_users() -> None:  # pragma: no cover - migration compatibility wrapper
    """No-op compatibility shim. Demo users are seeded by migration 0005."""
    return None


async def authenticate_user(username: str, password: str) -> dict[str, Any] | None:  # pragma: no cover - route compatibility wrapper
    pool = get_control_pool()
    async with pool.acquire() as conn:
        service = AuthService(UserRepo(conn), SessionRepo(conn), AuditRepo(conn))
        return await service.authenticate_user(username, password)


async def create_session(user: dict[str, Any]) -> dict[str, Any]:  # pragma: no cover - route compatibility wrapper
    pool = get_control_pool()
    async with pool.acquire() as conn:
        service = AuthService(UserRepo(conn), SessionRepo(conn), AuditRepo(conn))
        return await service.create_session(user)


async def get_user_by_token(token: str) -> dict[str, Any] | None:  # pragma: no cover - route compatibility wrapper
    pool = get_control_pool()
    async with pool.acquire() as conn:
        service = AuthService(UserRepo(conn), SessionRepo(conn), AuditRepo(conn))
        return await service.get_user_by_token(token)


async def revoke_session(token: str, actor: dict[str, Any] | None = None) -> None:  # pragma: no cover - route compatibility wrapper
    pool = get_control_pool()
    async with pool.acquire() as conn:
        service = AuthService(UserRepo(conn), SessionRepo(conn), AuditRepo(conn))
        await service.revoke_session(token, actor=actor)
