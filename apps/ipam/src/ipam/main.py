"""IPAM service main application.

Uses shared_python.create_service_app for standardized bootstrap.
NATS lifecycle is passed as startup/shutdown hooks.
"""

from shared_python import create_service_app, get_logger

from .core.config import settings
from .db.connection import db_pool
from .api import router, health_router
from .collectors.nats_handler import NATSHandler

logger = get_logger(__name__)

# --- NATS lifecycle hooks ---

nats_handler = NATSHandler()


async def _start_nats() -> None:
    """Connect NATS and start consumers."""
    await nats_handler.connect()
    await nats_handler.start_consumers()


async def _stop_nats() -> None:
    """Disconnect NATS gracefully."""
    await nats_handler.disconnect()


# --- Application ---

app = create_service_app(
    title="GridWatch IPAM Service",
    description="IP Address Management microservice",
    version="0.2.15",
    settings=settings,
    db=db_pool,
    routers=[health_router, router],
    on_startup=[_start_nats],
    on_shutdown=[_stop_nats],
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "ipam.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.is_development,
        log_level=settings.log_level.lower(),
    )
