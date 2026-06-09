from __future__ import annotations

from dataclasses import dataclass

from app.repos.login_attempt_repo import LoginAttemptRepo


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    attempt_count: int
    retry_after_seconds: int | None = None


class RateLimitService:
    MAX_ATTEMPTS = 8
    WINDOW_MINUTES = 5

    def __init__(self, repo: LoginAttemptRepo) -> None:
        self.repo = repo

    async def check(self, ip: str) -> RateLimitResult:
        attempt_count = await self.repo.count_recent(ip, self.WINDOW_MINUTES)
        allowed = attempt_count < self.MAX_ATTEMPTS
        return RateLimitResult(
            allowed=allowed,
            attempt_count=attempt_count,
            retry_after_seconds=None if allowed else self.WINDOW_MINUTES * 60,
        )

    async def record_failure(self, ip: str) -> None:
        await self.repo.record(ip)

    async def clear_on_success(self, ip: str) -> None:
        await self.repo.clear_by_ip(ip)
