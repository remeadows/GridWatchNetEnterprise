"""Syslog service main application.

SEC-020: Structured logging via structlog, restricted CORS.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings

logger = structlog.get_logger()


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    service: str
    version: str


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Startup
    logger.info(
        "syslog_service_starting",
        host=settings.SYSLOG_HOST,
        port=settings.SYSLOG_PORT,
        cors_origins=settings.SYSLOG_CORS_ORIGINS,
        log_level=settings.LOG_LEVEL,
    )

    yield

    # Shutdown
    logger.info("syslog_service_shutting_down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="GridWatch Syslog Service",
        description="Centralized syslog collection and forwarding",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS middleware (SEC-020: restricted from wildcard)
    allowed_origins = [
        origin.strip()
        for origin in settings.SYSLOG_CORS_ORIGINS.split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
    )

    @app.get("/healthz", response_model=HealthResponse)
    async def health_check() -> HealthResponse:
        """Health check endpoint."""
        return HealthResponse(
            status="healthy",
            service="syslog",
            version="0.1.0",
        )

    @app.get("/livez")
    async def liveness() -> dict:
        """Kubernetes liveness probe."""
        return {"status": "ok"}

    @app.get("/readyz")
    async def readiness() -> dict:
        """Kubernetes readiness probe."""
        return {"status": "ok"}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
    )

    uvicorn.run(
        "syslog.main:app",
        host=settings.SYSLOG_HOST,
        port=settings.SYSLOG_PORT,
        reload=True,
        log_level=settings.LOG_LEVEL.lower(),
    )
