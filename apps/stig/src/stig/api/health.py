"""Health check endpoints."""

from fastapi import APIRouter, Response

from ..db.connection import get_pool
from ..core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["health"])


@router.get("/healthz")
async def health_check() -> dict[str, str]:
    """Basic health check."""
    return {"status": "ok", "service": "stig"}


@router.get("/readyz")
async def readiness_check(response: Response) -> dict[str, str]:
    """Readiness check including database connectivity."""
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        logger.error("readiness_check_failed", error=str(e))
        response.status_code = 503
        return {"status": "not ready", "error": str(e)}


@router.get("/livez")
async def liveness_check() -> dict[str, str]:
    """Liveness check."""
    return {"status": "alive"}
