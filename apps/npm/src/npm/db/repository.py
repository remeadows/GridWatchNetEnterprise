"""Database repositories for NPM entities."""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from asyncpg import Connection

from ..models.device import Device, DeviceCreate, DeviceUpdate, DeviceStatus, DeviceWithInterfaces
from ..models.interface import Interface, InterfaceCreate, InterfaceUpdate, InterfaceStatus
from ..models.alert import (
    Alert, AlertCreate, AlertUpdate, AlertStatus,
    AlertRule, AlertRuleCreate, AlertRuleUpdate
)
from ..core.logging import get_logger

logger = get_logger(__name__)


def _row_to_dict(row: Any) -> dict[str, Any]:
    """Convert asyncpg Record to dictionary."""
    return dict(row) if row else {}


class DeviceRepository:
    """Repository for device operations."""

    def __init__(self, conn: Connection) -> None:
        self.conn = conn

    async def find_all(
        self,
        page: int = 1,
        limit: int = 20,
        search: str | None = None,
        status: DeviceStatus | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[Device], int]:
        """Find all devices with pagination and optional filters."""
        where_clauses = []
        params: list[Any] = []
        param_idx = 1

        if search:
            where_clauses.append(
                f"(name ILIKE ${param_idx} OR ip_address::text ILIKE ${param_idx} OR vendor ILIKE ${param_idx})"
            )
            params.append(f"%{search}%")
            param_idx += 1

        if status:
            where_clauses.append(f"status = ${param_idx}")
            params.append(status.value)
            param_idx += 1

        if is_active is not None:
            where_clauses.append(f"is_active = ${param_idx}")
            params.append(is_active)
            param_idx += 1

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        # Get total count
        count_sql = f"SELECT COUNT(*) FROM npm.devices {where_sql}"
        total = await self.conn.fetchval(count_sql, *params)

        # Get paginated results
        offset = (page - 1) * limit
        params.extend([limit, offset])

        query = f"""
            SELECT id, name, ip_address::text, device_type, vendor, model,
                   snmp_version, ssh_enabled, poll_interval, is_active,
                   last_poll, status, created_at, updated_at
            FROM npm.devices
            {where_sql}
            ORDER BY name ASC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """

        rows = await self.conn.fetch(query, *params)
        devices = [Device(**_row_to_dict(row)) for row in rows]

        return devices, total

    async def find_by_id(self, device_id: str) -> Device | None:
        """Find a device by ID."""
        query = """
            SELECT id, name, ip_address::text, device_type, vendor, model,
                   snmp_version, ssh_enabled, poll_interval, is_active,
                   last_poll, status, created_at, updated_at
            FROM npm.devices
            WHERE id = $1
        """
        row = await self.conn.fetchrow(query, UUID(device_id))
        return Device(**_row_to_dict(row)) if row else None

    async def find_by_id_with_interfaces(self, device_id: str) -> DeviceWithInterfaces | None:
        """Find a device by ID with its interfaces."""
        device = await self.find_by_id(device_id)
        if not device:
            return None

        # Get interfaces
        interface_query = """
            SELECT id, device_id, if_index, name, description, mac_address::text,
                   ip_addresses::text[], speed_mbps, admin_status, oper_status,
                   is_monitored, created_at, updated_at
            FROM npm.interfaces
            WHERE device_id = $1
            ORDER BY if_index
        """
        interface_rows = await self.conn.fetch(interface_query, UUID(device_id))
        interfaces = [Interface(**_row_to_dict(row)) for row in interface_rows]

        # Get active alert count
        alert_count = await self.conn.fetchval(
            "SELECT COUNT(*) FROM npm.alerts WHERE device_id = $1 AND status = 'active'",
            UUID(device_id)
        )

        return DeviceWithInterfaces(
            **device.model_dump(),
            interfaces=interfaces,
            interface_count=len(interfaces),
            active_alerts=alert_count or 0,
        )

    async def find_by_ip(self, ip_address: str) -> Device | None:
        """Find a device by IP address."""
        query = """
            SELECT id, name, ip_address::text, device_type, vendor, model,
                   snmp_version, ssh_enabled, poll_interval, is_active,
                   last_poll, status, created_at, updated_at
            FROM npm.devices
            WHERE ip_address = $1::inet
        """
        row = await self.conn.fetchrow(query, ip_address)
        return Device(**_row_to_dict(row)) if row else None

    async def find_active_for_polling(self) -> list[Device]:
        """Find all active devices that should be polled."""
        query = """
            SELECT id, name, ip_address::text, device_type, vendor, model,
                   snmp_version, ssh_enabled, poll_interval, is_active,
                   last_poll, status, created_at, updated_at
            FROM npm.devices
            WHERE is_active = true
            ORDER BY last_poll ASC NULLS FIRST
        """
        rows = await self.conn.fetch(query)
        return [Device(**_row_to_dict(row)) for row in rows]

    async def create(self, data: DeviceCreate, snmp_community_encrypted: str | None = None) -> Device:
        """Create a new device."""
        query = """
            INSERT INTO npm.devices (
                name, ip_address, device_type, vendor, model,
                snmp_community_encrypted, snmp_version, ssh_enabled,
                poll_interval, is_active, status
            )
            VALUES ($1, $2::inet, $3, $4, $5, $6, $7, $8, $9, $10, 'unknown')
            RETURNING id, name, ip_address::text, device_type, vendor, model,
                      snmp_version, ssh_enabled, poll_interval, is_active,
                      last_poll, status, created_at, updated_at
        """
        row = await self.conn.fetchrow(
            query,
            data.name,
            data.ip_address,
            data.device_type,
            data.vendor,
            data.model,
            snmp_community_encrypted,
            data.snmp_version.value,
            data.ssh_enabled,
            data.poll_interval,
            data.is_active,
        )
        logger.info("device_created", device_id=str(row["id"]), name=data.name)
        return Device(**_row_to_dict(row))

    async def update(self, device_id: str, data: DeviceUpdate, snmp_community_encrypted: str | None = None) -> Device | None:
        """Update an existing device."""
        updates = []
        params: list[Any] = [UUID(device_id)]
        param_idx = 2

        update_data = data.model_dump(exclude_unset=True, exclude={"snmp_community"})
        for field, value in update_data.items():
            if field == "ip_address":
                updates.append(f"ip_address = ${param_idx}::inet")
            elif field == "status":
                updates.append(f"status = ${param_idx}")
                value = value.value if hasattr(value, "value") else value
            elif field == "snmp_version":
                updates.append(f"snmp_version = ${param_idx}")
                value = value.value if hasattr(value, "value") else value
            else:
                updates.append(f"{field} = ${param_idx}")
            params.append(value)
            param_idx += 1

        # Handle encrypted SNMP community separately
        if snmp_community_encrypted is not None:
            updates.append(f"snmp_community_encrypted = ${param_idx}")
            params.append(snmp_community_encrypted)
            param_idx += 1

        if not updates:
            return await self.find_by_id(device_id)

        query = f"""
            UPDATE npm.devices
            SET {', '.join(updates)}, updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, ip_address::text, device_type, vendor, model,
                      snmp_version, ssh_enabled, poll_interval, is_active,
                      last_poll, status, created_at, updated_at
        """
        row = await self.conn.fetchrow(query, *params)
        if row:
            logger.info("device_updated", device_id=device_id)
        return Device(**_row_to_dict(row)) if row else None

    async def update_poll_status(
        self,
        device_id: str,
        status: DeviceStatus,
        last_poll: datetime | None = None
    ) -> None:
        """Update device poll status."""
        query = """
            UPDATE npm.devices
            SET status = $2, last_poll = COALESCE($3, NOW()), updated_at = NOW()
            WHERE id = $1
        """
        await self.conn.execute(query, UUID(device_id), status.value, last_poll)

    async def delete(self, device_id: str) -> bool:
        """Delete a device by ID."""
        query = "DELETE FROM npm.devices WHERE id = $1"
        result = await self.conn.execute(query, UUID(device_id))
        deleted = result == "DELETE 1"
        if deleted:
            logger.info("device_deleted", device_id=device_id)
        return deleted

    async def get_stats(self) -> dict[str, int]:
        """Get device statistics."""
        query = """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'up') as up,
                COUNT(*) FILTER (WHERE status = 'down') as down,
                COUNT(*) FILTER (WHERE status = 'degraded') as degraded,
                COUNT(*) FILTER (WHERE status = 'unknown') as unknown
            FROM npm.devices
            WHERE is_active = true
        """
        row = await self.conn.fetchrow(query)
        return _row_to_dict(row) if row else {}


class InterfaceRepository:
    """Repository for interface operations."""

    def __init__(self, conn: Connection) -> None:
        self.conn = conn

    async def find_by_device(
        self,
        device_id: str,
        is_monitored: bool | None = None,
    ) -> list[Interface]:
        """Find all interfaces for a device."""
        where_clauses = ["device_id = $1"]
        params: list[Any] = [UUID(device_id)]
        param_idx = 2

        if is_monitored is not None:
            where_clauses.append(f"is_monitored = ${param_idx}")
            params.append(is_monitored)

        where_sql = f"WHERE {' AND '.join(where_clauses)}"

        query = f"""
            SELECT id, device_id, if_index, name, description, mac_address::text,
                   ip_addresses::text[], speed_mbps, admin_status, oper_status,
                   is_monitored, created_at, updated_at
            FROM npm.interfaces
            {where_sql}
            ORDER BY if_index
        """
        rows = await self.conn.fetch(query, *params)
        return [Interface(**_row_to_dict(row)) for row in rows]

    async def find_by_id(self, interface_id: str) -> Interface | None:
        """Find an interface by ID."""
        query = """
            SELECT id, device_id, if_index, name, description, mac_address::text,
                   ip_addresses::text[], speed_mbps, admin_status, oper_status,
                   is_monitored, created_at, updated_at
            FROM npm.interfaces
            WHERE id = $1
        """
        row = await self.conn.fetchrow(query, UUID(interface_id))
        return Interface(**_row_to_dict(row)) if row else None

    async def upsert(self, data: InterfaceCreate) -> Interface:
        """Create or update an interface."""
        query = """
            INSERT INTO npm.interfaces (
                device_id, if_index, name, description, mac_address,
                ip_addresses, speed_mbps, admin_status, oper_status, is_monitored
            )
            VALUES ($1, $2, $3, $4, $5::macaddr, $6::inet[], $7, $8, $9, $10)
            ON CONFLICT (device_id, if_index)
            DO UPDATE SET
                name = COALESCE(EXCLUDED.name, npm.interfaces.name),
                description = COALESCE(EXCLUDED.description, npm.interfaces.description),
                mac_address = COALESCE(EXCLUDED.mac_address, npm.interfaces.mac_address),
                ip_addresses = COALESCE(EXCLUDED.ip_addresses, npm.interfaces.ip_addresses),
                speed_mbps = COALESCE(EXCLUDED.speed_mbps, npm.interfaces.speed_mbps),
                admin_status = COALESCE(EXCLUDED.admin_status, npm.interfaces.admin_status),
                oper_status = COALESCE(EXCLUDED.oper_status, npm.interfaces.oper_status),
                updated_at = NOW()
            RETURNING id, device_id, if_index, name, description, mac_address::text,
                      ip_addresses::text[], speed_mbps, admin_status, oper_status,
                      is_monitored, created_at, updated_at
        """
        row = await self.conn.fetchrow(
            query,
            UUID(data.device_id),
            data.if_index,
            data.name,
            data.description,
            data.mac_address,
            data.ip_addresses,
            data.speed_mbps,
            data.admin_status.value if data.admin_status else None,
            data.oper_status.value if data.oper_status else None,
            data.is_monitored,
        )
        return Interface(**_row_to_dict(row))

    async def update(self, interface_id: str, data: InterfaceUpdate) -> Interface | None:
        """Update an existing interface."""
        updates = []
        params: list[Any] = [UUID(interface_id)]
        param_idx = 2

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field in ("admin_status", "oper_status"):
                updates.append(f"{field} = ${param_idx}")
                value = value.value if hasattr(value, "value") else value
            else:
                updates.append(f"{field} = ${param_idx}")
            params.append(value)
            param_idx += 1

        if not updates:
            return await self.find_by_id(interface_id)

        query = f"""
            UPDATE npm.interfaces
            SET {', '.join(updates)}, updated_at = NOW()
            WHERE id = $1
            RETURNING id, device_id, if_index, name, description, mac_address::text,
                      ip_addresses::text[], speed_mbps, admin_status, oper_status,
                      is_monitored, created_at, updated_at
        """
        row = await self.conn.fetchrow(query, *params)
        return Interface(**_row_to_dict(row)) if row else None

    async def get_stats(self) -> dict[str, int]:
        """Get interface statistics."""
        query = """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE oper_status = 'up') as up,
                COUNT(*) FILTER (WHERE oper_status = 'down') as down
            FROM npm.interfaces
            WHERE is_monitored = true
        """
        row = await self.conn.fetchrow(query)
        return _row_to_dict(row) if row else {}


class AlertRuleRepository:
    """Repository for alert rule operations."""

    def __init__(self, conn: Connection) -> None:
        self.conn = conn

    async def find_all(self, is_active: bool | None = None) -> list[AlertRule]:
        """Find all alert rules."""
        where_clause = ""
        params: list[Any] = []

        if is_active is not None:
            where_clause = "WHERE is_active = $1"
            params.append(is_active)

        query = f"""
            SELECT id, name, description, metric_type, condition, threshold,
                   duration_seconds, severity, is_active, created_by,
                   created_at, updated_at
            FROM npm.alert_rules
            {where_clause}
            ORDER BY name
        """
        rows = await self.conn.fetch(query, *params)
        return [AlertRule(**_row_to_dict(row)) for row in rows]

    async def find_by_id(self, rule_id: str) -> AlertRule | None:
        """Find an alert rule by ID."""
        query = """
            SELECT id, name, description, metric_type, condition, threshold,
                   duration_seconds, severity, is_active, created_by,
                   created_at, updated_at
            FROM npm.alert_rules
            WHERE id = $1
        """
        row = await self.conn.fetchrow(query, UUID(rule_id))
        return AlertRule(**_row_to_dict(row)) if row else None

    async def create(self, data: AlertRuleCreate, created_by: str | None = None) -> AlertRule:
        """Create a new alert rule."""
        query = """
            INSERT INTO npm.alert_rules (
                name, description, metric_type, condition, threshold,
                duration_seconds, severity, is_active, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, name, description, metric_type, condition, threshold,
                      duration_seconds, severity, is_active, created_by,
                      created_at, updated_at
        """
        row = await self.conn.fetchrow(
            query,
            data.name,
            data.description,
            data.metric_type,
            data.condition.value,
            data.threshold,
            data.duration_seconds,
            data.severity.value,
            data.is_active,
            UUID(created_by) if created_by else None,
        )
        logger.info("alert_rule_created", rule_id=str(row["id"]), name=data.name)
        return AlertRule(**_row_to_dict(row))

    async def update(self, rule_id: str, data: AlertRuleUpdate) -> AlertRule | None:
        """Update an existing alert rule."""
        updates = []
        params: list[Any] = [UUID(rule_id)]
        param_idx = 2

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field in ("condition", "severity"):
                updates.append(f"{field} = ${param_idx}")
                value = value.value if hasattr(value, "value") else value
            else:
                updates.append(f"{field} = ${param_idx}")
            params.append(value)
            param_idx += 1

        if not updates:
            return await self.find_by_id(rule_id)

        query = f"""
            UPDATE npm.alert_rules
            SET {', '.join(updates)}, updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, description, metric_type, condition, threshold,
                      duration_seconds, severity, is_active, created_by,
                      created_at, updated_at
        """
        row = await self.conn.fetchrow(query, *params)
        if row:
            logger.info("alert_rule_updated", rule_id=rule_id)
        return AlertRule(**_row_to_dict(row)) if row else None

    async def delete(self, rule_id: str) -> bool:
        """Delete an alert rule by ID."""
        query = "DELETE FROM npm.alert_rules WHERE id = $1"
        result = await self.conn.execute(query, UUID(rule_id))
        deleted = result == "DELETE 1"
        if deleted:
            logger.info("alert_rule_deleted", rule_id=rule_id)
        return deleted


class AlertRepository:
    """Repository for alert operations."""

    def __init__(self, conn: Connection) -> None:
        self.conn = conn

    async def find_all(
        self,
        page: int = 1,
        limit: int = 20,
        status: AlertStatus | None = None,
        severity: str | None = None,
        device_id: str | None = None,
    ) -> tuple[list[Alert], int]:
        """Find all alerts with pagination and optional filters."""
        where_clauses = []
        params: list[Any] = []
        param_idx = 1

        if status:
            where_clauses.append(f"status = ${param_idx}")
            params.append(status.value)
            param_idx += 1

        if severity:
            where_clauses.append(f"severity = ${param_idx}")
            params.append(severity)
            param_idx += 1

        if device_id:
            where_clauses.append(f"device_id = ${param_idx}")
            params.append(UUID(device_id))
            param_idx += 1

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        # Get total count
        count_sql = f"SELECT COUNT(*) FROM npm.alerts {where_sql}"
        total = await self.conn.fetchval(count_sql, *params)

        # Get paginated results
        offset = (page - 1) * limit
        params.extend([limit, offset])

        query = f"""
            SELECT id, rule_id, device_id, interface_id, message, severity,
                   status, triggered_at, acknowledged_at, acknowledged_by,
                   resolved_at, details
            FROM npm.alerts
            {where_sql}
            ORDER BY triggered_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """

        rows = await self.conn.fetch(query, *params)
        alerts = [Alert(**_row_to_dict(row)) for row in rows]

        return alerts, total

    async def find_by_id(self, alert_id: str) -> Alert | None:
        """Find an alert by ID."""
        query = """
            SELECT id, rule_id, device_id, interface_id, message, severity,
                   status, triggered_at, acknowledged_at, acknowledged_by,
                   resolved_at, details
            FROM npm.alerts
            WHERE id = $1
        """
        row = await self.conn.fetchrow(query, UUID(alert_id))
        return Alert(**_row_to_dict(row)) if row else None

    async def create(self, data: AlertCreate) -> Alert:
        """Create a new alert."""
        query = """
            INSERT INTO npm.alerts (
                rule_id, device_id, interface_id, message, severity,
                status, triggered_at, details
            )
            VALUES ($1, $2, $3, $4, $5, 'active', NOW(), $6)
            RETURNING id, rule_id, device_id, interface_id, message, severity,
                      status, triggered_at, acknowledged_at, acknowledged_by,
                      resolved_at, details
        """
        row = await self.conn.fetchrow(
            query,
            UUID(data.rule_id) if data.rule_id else None,
            UUID(data.device_id) if data.device_id else None,
            UUID(data.interface_id) if data.interface_id else None,
            data.message,
            data.severity.value,
            data.details,
        )
        logger.info("alert_created", alert_id=str(row["id"]))
        return Alert(**_row_to_dict(row))

    async def update_status(
        self,
        alert_id: str,
        status: AlertStatus,
        acknowledged_by: str | None = None,
    ) -> Alert | None:
        """Update alert status."""
        updates = ["status = $2"]
        params: list[Any] = [UUID(alert_id), status.value]
        param_idx = 3

        if status == AlertStatus.ACKNOWLEDGED and acknowledged_by:
            updates.append(f"acknowledged_at = NOW()")
            updates.append(f"acknowledged_by = ${param_idx}")
            params.append(UUID(acknowledged_by))
            param_idx += 1
        elif status == AlertStatus.RESOLVED:
            updates.append("resolved_at = NOW()")

        query = f"""
            UPDATE npm.alerts
            SET {', '.join(updates)}
            WHERE id = $1
            RETURNING id, rule_id, device_id, interface_id, message, severity,
                      status, triggered_at, acknowledged_at, acknowledged_by,
                      resolved_at, details
        """
        row = await self.conn.fetchrow(query, *params)
        if row:
            logger.info("alert_status_updated", alert_id=alert_id, status=status.value)
        return Alert(**_row_to_dict(row)) if row else None

    async def get_active_count(self) -> dict[str, int]:
        """Get count of active alerts by severity."""
        query = """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE severity = 'critical') as critical,
                COUNT(*) FILTER (WHERE severity = 'warning') as warning,
                COUNT(*) FILTER (WHERE severity = 'info') as info
            FROM npm.alerts
            WHERE status = 'active'
        """
        row = await self.conn.fetchrow(query)
        return _row_to_dict(row) if row else {}

    async def get_recent(self, limit: int = 10) -> list[Alert]:
        """Get recent alerts."""
        query = """
            SELECT id, rule_id, device_id, interface_id, message, severity,
                   status, triggered_at, acknowledged_at, acknowledged_by,
                   resolved_at, details
            FROM npm.alerts
            ORDER BY triggered_at DESC
            LIMIT $1
        """
        rows = await self.conn.fetch(query, limit)
        return [Alert(**_row_to_dict(row)) for row in rows]
