"""Database connection pool management."""

from typing import AsyncGenerator

import asyncpg

from ..core.config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)

# Global pool instance
_pool: asyncpg.Pool | None = None


async def init_db() -> asyncpg.Pool:
    """Initialize the database connection pool.

    Returns:
        The connection pool instance.
    """
    global _pool

    if _pool is not None:
        return _pool

    logger.info("initializing_database_pool", dsn=str(settings.postgres_url).split("@")[-1])

    _pool = await asyncpg.create_pool(
        str(settings.postgres_url),
        min_size=2,
        max_size=10,
        command_timeout=60,
        server_settings={"search_path": "stig,shared,public"},
    )

    logger.info("database_pool_initialized")
    return _pool


async def close_db() -> None:
    """Close the database connection pool."""
    global _pool

    if _pool is not None:
        logger.info("closing_database_pool")
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    """Get the database connection pool.

    Returns:
        The connection pool instance.

    Raises:
        RuntimeError: If pool is not initialized.
    """
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db() first.")
    return _pool


async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection from the pool.

    Yields:
        A database connection.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn
