"""NPM collectors module."""

# Lazy imports to avoid circular imports and module re-import warnings
# when running as `python -m npm.collectors.snmp_poller`
__all__ = ["NATSHandler", "SNMPPoller"]


def __getattr__(name: str):
    """Lazy load collectors to avoid import issues."""
    if name == "NATSHandler":
        from .nats_handler import NATSHandler
        return NATSHandler
    if name == "SNMPPoller":
        from .snmp_poller import SNMPPoller
        return SNMPPoller
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
