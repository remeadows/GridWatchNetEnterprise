"""Device service for business logic."""

from math import ceil

from ..db import get_db, DeviceRepository, InterfaceRepository, AlertRepository
from ..models.device import Device, DeviceCreate, DeviceUpdate, DeviceWithInterfaces, DeviceStatus
from ..models.interface import Interface, InterfaceUpdate
from ..models.alert import Alert, AlertStatus
from ..models.common import PaginatedResponse, Pagination
from ..core.logging import get_logger
from .crypto import get_crypto_service

logger = get_logger(__name__)


class DeviceService:
    """Service for device operations."""

    def __init__(self) -> None:
        self.crypto = get_crypto_service()

    async def list_devices(
        self,
        page: int = 1,
        limit: int = 20,
        search: str | None = None,
        status: DeviceStatus | None = None,
        is_active: bool | None = None,
    ) -> PaginatedResponse[Device]:
        """List all devices with pagination and optional filters."""
        async with get_db() as conn:
            repo = DeviceRepository(conn)
            devices, total = await repo.find_all(
                page=page,
                limit=limit,
                search=search,
                status=status,
                is_active=is_active,
            )

            return PaginatedResponse(
                data=devices,
                pagination=Pagination(
                    page=page,
                    limit=limit,
                    total=total,
                    pages=ceil(total / limit) if total > 0 else 0,
                ),
            )

    async def get_device(self, device_id: str) -> Device | None:
        """Get a device by ID."""
        async with get_db() as conn:
            repo = DeviceRepository(conn)
            return await repo.find_by_id(device_id)

    async def get_device_with_interfaces(self, device_id: str) -> DeviceWithInterfaces | None:
        """Get a device with its interfaces."""
        async with get_db() as conn:
            repo = DeviceRepository(conn)
            return await repo.find_by_id_with_interfaces(device_id)

    async def create_device(self, data: DeviceCreate) -> Device:
        """Create a new device."""
        async with get_db() as conn:
            repo = DeviceRepository(conn)

            # Check for duplicate IP
            existing = await repo.find_by_ip(data.ip_address)
            if existing:
                raise ValueError(f"Device with IP {data.ip_address} already exists")

            # Encrypt SNMP community if provided
            snmp_community_encrypted = None
            if data.snmp_community:
                snmp_community_encrypted = self.crypto.encrypt(data.snmp_community)

            return await repo.create(data, snmp_community_encrypted)

    async def update_device(self, device_id: str, data: DeviceUpdate) -> Device | None:
        """Update an existing device."""
        async with get_db() as conn:
            repo = DeviceRepository(conn)

            # Check device exists
            existing = await repo.find_by_id(device_id)
            if not existing:
                return None

            # Check for duplicate IP if changing
            if data.ip_address and data.ip_address != existing.ip_address:
                ip_existing = await repo.find_by_ip(data.ip_address)
                if ip_existing:
                    raise ValueError(f"Device with IP {data.ip_address} already exists")

            # Encrypt SNMP community if provided
            snmp_community_encrypted = None
            if hasattr(data, 'snmp_community') and data.snmp_community:
                snmp_community_encrypted = self.crypto.encrypt(data.snmp_community)

            return await repo.update(device_id, data, snmp_community_encrypted)

    async def delete_device(self, device_id: str) -> bool:
        """Delete a device by ID."""
        async with get_db() as conn:
            repo = DeviceRepository(conn)
            return await repo.delete(device_id)

    async def get_device_interfaces(self, device_id: str) -> list[Interface]:
        """Get all interfaces for a device."""
        async with get_db() as conn:
            repo = InterfaceRepository(conn)
            return await repo.find_by_device(device_id)

    async def update_interface(self, interface_id: str, data: InterfaceUpdate) -> Interface | None:
        """Update an interface."""
        async with get_db() as conn:
            repo = InterfaceRepository(conn)
            return await repo.update(interface_id, data)

    async def get_device_alerts(
        self,
        device_id: str,
        status: AlertStatus | None = None,
        limit: int = 50,
    ) -> list[Alert]:
        """Get alerts for a device."""
        async with get_db() as conn:
            repo = AlertRepository(conn)
            alerts, _ = await repo.find_all(
                page=1,
                limit=limit,
                status=status,
                device_id=device_id,
            )
            return alerts

    async def acknowledge_alert(self, alert_id: str, user_id: str) -> Alert | None:
        """Acknowledge an alert."""
        async with get_db() as conn:
            repo = AlertRepository(conn)
            return await repo.update_status(
                alert_id,
                AlertStatus.ACKNOWLEDGED,
                acknowledged_by=user_id,
            )

    async def resolve_alert(self, alert_id: str) -> Alert | None:
        """Resolve an alert."""
        async with get_db() as conn:
            repo = AlertRepository(conn)
            return await repo.update_status(alert_id, AlertStatus.RESOLVED)

    async def get_active_devices_for_polling(self) -> list[Device]:
        """Get all active devices that should be polled."""
        async with get_db() as conn:
            repo = DeviceRepository(conn)
            return await repo.find_active_for_polling()

    async def get_snmp_community(self, device_id: str) -> str | None:
        """Get decrypted SNMP community string for a device."""
        async with get_db() as conn:
            query = "SELECT snmp_community_encrypted FROM npm.devices WHERE id = $1"
            row = await conn.fetchrow(query, device_id)
            if row and row["snmp_community_encrypted"]:
                try:
                    return self.crypto.decrypt(row["snmp_community_encrypted"])
                except Exception:
                    logger.warning("failed_to_decrypt_snmp_community", device_id=device_id)
            return None
