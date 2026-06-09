from collections.abc import Callable
from fastapi import Depends, Header, HTTPException, status

from app.services.auth_service import get_user_by_token

async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = authorization.split(" ", 1)[1].strip()
    user = await get_user_by_token(token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session.",
        )

    return user

def require_roles(*roles: str) -> Callable:
    async def _dependency(current_user: dict = Depends(get_current_user)) -> dict:
        if roles and current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(roles)}.",
            )
        return current_user

    return _dependency
