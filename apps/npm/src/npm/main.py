"""NPM service main application."""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.logging import configure_logging, get_logger
from .db.connection import init_db, close_db
from .api import router, health_router
from .collectors.nats_handler import NATSHandler

configure_logging()
logger = get_logger(__name__)

# NATS handler instance
nats_handler: NATSHandler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    global nats_handler

    logger.info(
        "starting_npm_service",
        environment=settings.environment,
        host=settings.host,
        port=settings.port,
    )

    # Initialize database pool
    await init_db()

    # Connect to NATS
    try:
        nats_handler = NATSHandler()
        await nats_handler.connect()
        await nats_handler.start_consumers()
    except Exception as e:
        logger.warning("nats_connection_skipped", error=str(e))
        nats_handler = None

    yield

    # Cleanup
    logger.info("shutting_down_npm_service")

    if nats_handler:
        await nats_handler.disconnect()

    await close_db()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="GridWatch NPM Service",
        description="Network Performance Monitoring microservice",
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
        "npm.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.is_development,
        log_level=settings.log_level.lower(),
    )
