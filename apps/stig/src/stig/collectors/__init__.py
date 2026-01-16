"""STIG collectors module."""

# Lazy imports to avoid circular imports and module re-import warnings
# when running as `python -m stig.collectors.nats_handler`
__all__ = ["NATSHandler", "SSHAuditor", "ConfigParser", "get_parser", "detect_platform_from_content"]


def __getattr__(name: str):
    """Lazy load collectors to avoid import issues."""
    if name == "NATSHandler":
        from .nats_handler import NATSHandler
        return NATSHandler
    if name == "SSHAuditor":
        from .ssh_auditor import SSHAuditor
        return SSHAuditor
    if name == "ConfigParser":
        from .config_analyzer import ConfigParser
        return ConfigParser
    if name == "get_parser":
        from .config_analyzer import get_parser
        return get_parser
    if name == "detect_platform_from_content":
        from .config_analyzer import detect_platform_from_content
        return detect_platform_from_content
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
