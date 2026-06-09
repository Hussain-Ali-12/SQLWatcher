from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_control_pool: asyncpg.Pool | None = None
_target_pool: asyncpg.Pool | None = None

_UNSUPPORTED_ASYNCPG_DSN_PARAMS = {"channel_binding"}
_SSLMODE_TRUE = {"require", "verify-ca", "verify-full"}
_SSLMODE_FALSE = {"disable"}


def prepare_asyncpg_dsn(database_url: str) -> tuple[str, bool | None]:
    """Return an asyncpg-safe DSN and ssl argument.

    Neon/libpq URLs commonly include query parameters such as
    ``channel_binding=require``. psycopg/libpq accepts that parameter, but
    asyncpg does not; if left in the URL it can prevent the backend from
    starting. This helper removes unsupported libpq-only parameters and converts
    ``sslmode`` into asyncpg's explicit ``ssl`` argument.
    """

    parts = urlsplit(database_url)
    query_pairs = parse_qsl(parts.query, keep_blank_values=True)
    cleaned_pairs: list[tuple[str, str]] = []
    ssl_arg: bool | None = None

    for key, value in query_pairs:
        normalized_key = key.lower()
        if normalized_key in _UNSUPPORTED_ASYNCPG_DSN_PARAMS:
            continue
        if normalized_key == "sslmode":
            mode = value.lower()
            if mode in _SSLMODE_TRUE:
                ssl_arg = True
            elif mode in _SSLMODE_FALSE:
                ssl_arg = False
            # asyncpg receives the SSL decision through the ssl= argument.
            continue
        cleaned_pairs.append((key, value))

    cleaned_query = urlencode(cleaned_pairs, doseq=True)
    cleaned_dsn = urlunsplit((parts.scheme, parts.netloc, parts.path, cleaned_query, parts.fragment))
    return cleaned_dsn, ssl_arg


async def _create_pool_with_retry(
    name: str,
    database_url: str,
    *,
    min_size: int,
    max_size: int,
) -> asyncpg.Pool:
    """Create an asyncpg pool with SQLWatcher's existing 30-attempt retry policy."""

    last_error: Exception | None = None
    safe_dsn, ssl_arg = prepare_asyncpg_dsn(database_url)

    for attempt in range(1, 31):
        try:
            pool = await asyncpg.create_pool(
                safe_dsn,
                min_size=min_size,
                max_size=max_size,
                command_timeout=30,
                max_inactive_connection_lifetime=settings.db_pool_max_inactive_connection_lifetime,
                ssl=ssl_arg,
            )
            logger.info(
                "database_pool_initialized",
                database=name,
                attempt=attempt,
                min_size=min_size,
                max_size=max_size,
                max_inactive_connection_lifetime=settings.db_pool_max_inactive_connection_lifetime,
                ssl_enabled=bool(ssl_arg),
            )
            return pool
        except (OSError, ConnectionRefusedError, asyncpg.PostgresError, ValueError) as exc:
            last_error = exc
            logger.warning(
                "database_pool_retry",
                database=name,
                attempt=attempt,
                max_attempts=30,
                error=str(exc),
            )
            await asyncio.sleep(2)

    logger.error("database_pool_failed", database=name, error=str(last_error))
    raise RuntimeError(f"Could not connect to {name} database after retries: {last_error}")


async def init_db_pool() -> None:
    """Initialise the control-plane and target application database pools."""

    global _control_pool, _target_pool
    if _control_pool is None:
        _control_pool = await _create_pool_with_retry(
            "SQLWatcher control-plane",
            str(settings.sqlwatcher_database_url),
            min_size=settings.control_db_pool_min_size,
            max_size=settings.control_db_pool_max_size,
        )
    if _target_pool is None:
        _target_pool = await _create_pool_with_retry(
            "Target application",
            str(settings.target_database_url),
            min_size=settings.target_db_pool_min_size,
            max_size=settings.target_db_pool_max_size,
        )


async def close_db_pool() -> None:
    """Close both database pools if they are open."""

    global _control_pool, _target_pool
    if _control_pool is not None:
        await _control_pool.close()
        logger.info("database_pool_closed", database="SQLWatcher control-plane")
        _control_pool = None
    if _target_pool is not None:
        await _target_pool.close()
        logger.info("database_pool_closed", database="Target application")
        _target_pool = None


def get_control_pool() -> asyncpg.Pool:
    """Return the initialized SQLWatcher control-plane pool."""

    if _control_pool is None:
        raise RuntimeError("SQLWatcher control-plane database pool is not initialized.")
    return _control_pool


def get_target_pool() -> asyncpg.Pool:
    """Return the initialized protected target database pool."""

    if _target_pool is None:
        raise RuntimeError("Target application database pool is not initialized.")
    return _target_pool


async def get_control_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """FastAPI dependency yielding a control-plane connection."""

    async with get_control_pool().acquire() as conn:
        yield conn


async def get_target_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """FastAPI dependency yielding a target database connection."""

    async with get_target_pool().acquire() as conn:
        yield conn


async def fetch(query: str, *args):
    async with get_control_pool().acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args):
    async with get_control_pool().acquire() as conn:
        return await conn.fetchrow(query, *args)


async def execute(query: str, *args):
    async with get_control_pool().acquire() as conn:
        return await conn.execute(query, *args)


async def target_fetch(query: str, *args):
    async with get_target_pool().acquire() as conn:
        return await conn.fetch(query, *args)


async def target_fetchrow(query: str, *args):
    async with get_target_pool().acquire() as conn:
        return await conn.fetchrow(query, *args)


async def target_execute(query: str, *args):
    async with get_target_pool().acquire() as conn:
        return await conn.execute(query, *args)
