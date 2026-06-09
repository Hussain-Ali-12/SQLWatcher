from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app.dependencies.auth import get_current_user
from app.dependencies.db import Repos, get_repos
from app.models.schemas import LoginRequest, LoginResponse
from app.services.auth_service import AuthService
from app.services.rate_limit_service import RateLimitService

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, repos: Repos = Depends(get_repos)):
    ip = request.client.host if request.client else "unknown"
    username_key = f"user:{payload.username.lower().strip()}"
    rate_limiter = RateLimitService(repos.login_attempt)
    await repos.login_attempt.prune_old(24)

    ip_limit = await rate_limiter.check(ip)
    username_limit = await rate_limiter.check(username_key)
    if not ip_limit.allowed or not username_limit.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again after a few minutes.",
        )

    auth_service = AuthService(repos.user, repos.session, repos.audit)
    user = await auth_service.authenticate_user(payload.username, payload.password)
    if user is None:
        await rate_limiter.record_failure(ip)
        await rate_limiter.record_failure(username_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    session = await auth_service.create_session(user)
    await rate_limiter.clear_on_success(ip)
    return {
        "access_token": session["token"],
        "token_type": "bearer",
        "expires_at": session["expires_at"],
        "user": user,
    }


@router.post("/logout")
async def logout(
    authorization: str | None = Header(default=None),
    current_user: dict = Depends(get_current_user),
    repos: Repos = Depends(get_repos),
):
    token = authorization.split(" ", 1)[1].strip() if authorization else ""
    await AuthService(repos.user, repos.session, repos.audit).revoke_session(token, actor=current_user)
    return {"status": "logged_out"}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user
