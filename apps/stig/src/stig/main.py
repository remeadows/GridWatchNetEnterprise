"""STIG service main application."""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.logging import configure_logging, get_logger
from .db.connection import init_db, close_db
from .api import router, health_router
from .services.audit import AuditService
from .library import initialize_library

configure_logging()
logger = get_logger(__name__)

# Service instances
audit_service: AuditService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    global audit_service

    logger.info(
        "starting_stig_service",
        environment=settings.environment,
        host=settings.host,
        port=settings.port,
    )

    # Initialize database pool
    await init_db()

    # Initialize audit service with NATS
    try:
        audit_service = AuditService()
        await audit_service.connect_nats()
    except Exception as e:
        logger.warning("nats_connection_skipped", error=str(e))
        audit_service = AuditService()  # Without NATS

    # Initialize STIG Library if path is configured
    if settings.stig_library_path:
        try:
            logger.info(
                "initializing_stig_library",
                library_path=settings.stig_library_path,
            )
            catalog = initialize_library(settings.stig_library_path)
            logger.info(
                "stig_library_initialized",
                total_entries=len(catalog),
            )
        except Exception as e:
            logger.warning("stig_library_init_failed", error=str(e))
    else:
        logger.info("stig_library_path_not_configured")

    yield

    # Cleanup
    logger.info("shutting_down_stig_service")

    if audit_service:
        await audit_service.disconnect_nats()

    await close_db()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="GridWatch STIG Service",
        description="Security Technical Implementation Guide (STIG) Manager microservice",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.is_development else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routes
    app.include_router(health_router)
    app.include_router(router)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "stig.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.is_development,
        log_level=settings.log_level.lower(),
    )
