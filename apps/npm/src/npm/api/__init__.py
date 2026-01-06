"""NPM API module."""

from .routes import router
from .health import router as health_router

__all__ = ["router", "health_router"]
