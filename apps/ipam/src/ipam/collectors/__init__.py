"""Network collectors and NATS message handling."""

# Lazy import to avoid circular imports and module re-import warnings
# when running as `python -m ipam.collectors.nats_handler`
__all__ = ["NATSHandler"]


def __getattr__(name: str):
    """Lazy load NATSHandler to avoid import issues."""
    if name == "NATSHandler":
        from .nats_handler import NATSHandler
        return NATSHandler
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
