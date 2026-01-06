"""PostgreSQL connection pool management."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from asyncpg import Pool

from ..core.config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)

_pool: Pool | None = None


async def init_db() -> None:
    """Initialize the database connection pool."""
    global _pool

    if _pool is not None:
        return

    logger.info("initializing_database_pool", url=str(settings.postgres_url).split("@")[-1])

    _pool = await asyncpg.create_pool(
        str(settings.postgres_url),
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        command_timeout=60,
        server_settings={
            "search_path": "npm,shared,public",
        },
    )

    logger.info("database_pool_initialized", min_size=settings.db_pool_min, max_size=settings.db_pool_max)


async def close_db() -> None:
    """Close the database connection pool."""
    global _pool

    if _pool is None:
        return

    logger.info("closing_database_pool")
    await _pool.close()
    _pool = None


def get_pool() -> Pool:
    """Get the database connection pool."""
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db() first.")
    return _pool


@asynccontextmanager
async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection from the pool."""
    pool = get_pool()
    async with pool.acquire() as connection:
        yield connection


@asynccontextmanager
async def transaction() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection with an active transaction."""
    pool = get_pool()
    async with pool.acquire() as connection:
        async with connection.transaction():
            yield connection


async def check_health() -> bool:
    """Check database connectivity."""
    try:
        async with get_db() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception as e:
        logger.error("database_health_check_failed", error=str(e))
        return False
