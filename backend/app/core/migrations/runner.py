from __future__ import annotations

import hashlib
import re
from pathlib import Path

import asyncpg

from app.core.logging import get_logger

logger = get_logger(__name__)
MIGRATION_RE = re.compile(r"^(\d{4}_.+)\.sql$")


async def _ensure_migration_log(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS migration_log (
            migration_id  VARCHAR(128) PRIMARY KEY,
            applied_at    TIMESTAMPTZ DEFAULT NOW(),
            checksum      VARCHAR(64) NOT NULL
        )
        """
    )


def _migration_files() -> list[Path]:
    migrations_dir = Path(__file__).resolve().parent
    files = [path for path in migrations_dir.iterdir() if path.is_file() and MIGRATION_RE.match(path.name)]
    return sorted(files, key=lambda path: int(path.name.split("_", 1)[0]))


def _checksum(sql: str) -> str:
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


async def run_migrations(pool: asyncpg.Pool) -> None:
    """Run pending SQL migrations against the control database."""

    files = _migration_files()
    applied_now = 0

    async with pool.acquire() as conn:
        await _ensure_migration_log(conn)
        for path in files:
            match = MIGRATION_RE.match(path.name)
            if not match:
                continue
            migration_id = match.group(1)
            sql = path.read_text(encoding="utf-8")
            checksum = _checksum(sql)

            existing = await conn.fetchrow(
                "SELECT checksum FROM migration_log WHERE migration_id = $1",
                migration_id,
            )
            if existing is not None:
                if existing["checksum"] != checksum:
                    logger.error(
                        "migration_checksum_mismatch",
                        migration_id=migration_id,
                        expected=existing["checksum"],
                        actual=checksum,
                    )
                    raise RuntimeError(
                        f"Migration {migration_id} checksum mismatch. "
                        "A migration file was modified after being applied."
                    )
                logger.debug("migration_skipped", migration_id=migration_id)
                continue

            logger.info("migration_applying", migration_id=migration_id)
            try:
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute(
                        """
                        INSERT INTO migration_log (migration_id, checksum)
                        VALUES ($1, $2)
                        """,
                        migration_id,
                        checksum,
                    )
                applied_now += 1
                logger.info("migration_applied", migration_id=migration_id)
            except Exception as exc:
                logger.exception("migration_failed", migration_id=migration_id, error=str(exc))
                raise

    if applied_now:
        logger.info("migrations_complete", applied_new=applied_now, total=len(files))
    else:
        logger.info("migrations_complete", message=f"All {len(files)} migrations already applied", applied_new=0, total=len(files))
