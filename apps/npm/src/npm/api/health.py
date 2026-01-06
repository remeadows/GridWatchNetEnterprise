"""Health check endpoints."""

from fastapi import APIRouter

from ..db.connection import check_health as check_db_health

router = APIRouter(tags=["Health"])


@router.get("/healthz")
async def health_check() -> dict:
    """Basic health check."""
    return {"status": "healthy", "service": "npm"}


@router.get("/readyz")
async def readiness_check() -> dict:
    """Readiness check including dependencies."""
    db_healthy = await check_db_health()

    if not db_healthy:
        return {"status": "not ready", "database": "unhealthy"}

    return {"status": "ready", "database": "healthy"}


@router.get("/livez")
async def liveness_check() -> dict:
    """Liveness check."""
    return {"status": "alive"}
