"""STIG API module."""

from .health import router as health_router
from .routes import router

__all__ = ["router", "health_router"]
