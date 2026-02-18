"""GridWatch NetEnterprise - Shared Python Library.

Consolidates common patterns used across IPAM, NPM, STIG, and Syslog services:
- BaseServiceSettings: Pydantic config with common infra fields
- configure_logging(): structlog setup (dev console / prod JSON)
- DatabasePool: asyncpg pool with retry/backoff on startup
- create_health_router(): FastAPI health endpoint factory
- create_service_app(): FastAPI app bootstrap factory
"""

from .config import BaseServiceSettings
from .logging import configure_logging, get_logger, bind_context, clear_context
from .database import DatabasePool
from .health import create_health_router
from .app_factory import create_service_app

__all__ = [
    "BaseServiceSettings",
    "configure_logging",
    "get_logger",
    "bind_context",
    "clear_context",
    "DatabasePool",
    "create_health_router",
    "create_service_app",
]
