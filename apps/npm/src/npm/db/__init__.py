"""Database module for NPM service."""

from .connection import init_db, close_db, get_db, get_pool, transaction, check_health
from .repository import DeviceRepository, InterfaceRepository, AlertRepository, AlertRuleRepository

__all__ = [
    "init_db",
    "close_db",
    "get_db",
    "get_pool",
    "transaction",
    "check_health",
    "DeviceRepository",
    "InterfaceRepository",
    "AlertRepository",
    "AlertRuleRepository",
]
