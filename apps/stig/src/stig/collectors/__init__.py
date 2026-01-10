"""STIG collectors module."""

# Lazy imports to avoid circular imports and module re-import warnings
# when running as `python -m stig.collectors.nats_handler`
__all__ = ["NATSHandler", "SSHAuditor"]


def __getattr__(name: str):
    """Lazy load collectors to avoid import issues."""
    if name == "NATSHandler":
        from .nats_handler import NATSHandler
        return NATSHandler
    if name == "SSHAuditor":
        from .ssh_auditor import SSHAuditor
        return SSHAuditor
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
