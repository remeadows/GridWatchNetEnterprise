"""FastAPI application bootstrap factory.

Eliminates duplicated create_app() / lifespan() patterns across services.
Each service calls create_service_app() with its config, routes, and optional
startup/shutdown hooks (NATS, collectors, etc.).

Usage:
    from shared_python import create_service_app, BaseServiceSettings, DatabasePool

    class Settings(BaseServiceSettings):
        ipam_host: str = Field(default="0.0.0.0", alias="IPAM_HOST")

    settings = Settings()
    db = DatabasePool(dsn=str(settings.postgres_url), schema="ipam,shared,public")

    app = create_service_app(
        title="GridWatch IPAM Service",
        description="IP Address Management microservice",
        version="0.2.15",
        settings=settings,
        db=db,
        routers=[health_router, api_router],
        on_startup=[nats_handler.connect, nats_handler.start_consumers],
        on_shutdown=[nats_handler.disconnect],
    )
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator, Awaitable, Callable, Sequence

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import BaseServiceSettings
from .database import DatabasePool
from .logging import configure_logging, get_logger

logger = get_logger(__name__)

# Type alias for async lifecycle hooks
LifecycleHook = Callable[[], Awaitable[None]]


def create_service_app(
    *,
    title: str,
    description: str,
    version: str,
    settings: BaseServiceSettings,
    db: DatabasePool,
    routers: Sequence[APIRouter],
    on_startup: Sequence[LifecycleHook] | None = None,
    on_shutdown: Sequence[LifecycleHook] | None = None,
    cors_origins: list[str] | None = None,
) -> FastAPI:
    """Create a fully configured FastAPI application.

    Handles:
    - Logging configuration
    - DB pool init with retry/backoff
    - CORS middleware
    - Router registration
    - Lifespan hooks for startup/shutdown (NATS, collectors, etc.)
    - Docs endpoint gating (dev only)

    Args:
        title: OpenAPI title.
        description: OpenAPI description.
        version: Service version string.
        settings: Service settings (subclass of BaseServiceSettings).
        db: DatabasePool instance (not yet initialized).
        routers: Sequence of APIRouter instances to register.
        on_startup: Additional async callables to run after DB init.
        on_shutdown: Additional async callables to run before DB close.
        cors_origins: Allowed CORS origins. Defaults to ["*"] in dev, [] in prod.
    """
    # Configure logging early
    configure_logging(
        log_level=settings.log_level,
        is_development=settings.is_development,
    )

    _startup_hooks = list(on_startup or [])
    _shutdown_hooks = list(on_shutdown or [])

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
        logger.info(
            "service_starting",
            title=title,
            environment=settings.environment,
            host=settings.host,
            port=settings.port,
        )

        # 1. Initialize database pool (retries built in)
        await db.init()

        # 2. Run additional startup hooks (NATS, collectors, etc.)
        for hook in _startup_hooks:
            try:
                await hook()
            except Exception as e:
                logger.warning(
                    "startup_hook_failed",
                    hook=hook.__qualname__,
                    error=str(e),
                )

        yield

        # Shutdown — reverse order
        logger.info("service_shutting_down", title=title)

        for hook in reversed(_shutdown_hooks):
            try:
                await hook()
            except Exception as e:
                logger.warning(
                    "shutdown_hook_failed",
                    hook=hook.__qualname__,
                    error=str(e),
                )

        await db.close()

    origins = cors_origins if cors_origins is not None else (
        ["*"] if settings.is_development else []
    )

    app = FastAPI(
        title=title,
        description=description,
        version=version,
        lifespan=lifespan,
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in routers:
        app.include_router(router)

    return app
