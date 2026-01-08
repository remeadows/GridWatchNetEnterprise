"""
Syslog forwarder service.

Forwards syslog events to external systems (SIEM, log aggregators, etc.)
"""

import asyncio
import json
import socket
import ssl
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg
import structlog
from nats.aio.client import Client as NATSClient

from .config import settings

logger = structlog.get_logger()


@dataclass
class ForwarderConfig:
    """Configuration for a single forwarder."""

    id: str
    name: str
    target_host: str
    target_port: int
    protocol: str  # "udp", "tcp", "tls"
    tls_enabled: bool
    tls_verify: bool
    filter_criteria: dict[str, Any]
    buffer_size: int
    retry_count: int
    retry_delay_ms: int


class SyslogForwarder:
    """
    Forwards syslog events to external systems.

    Features:
    - UDP, TCP, and TLS forwarding
    - Configurable filtering
    - Retry with backoff
    - Event buffering
    """

    def __init__(self, config: ForwarderConfig) -> None:
        self.config = config
        self.buffer: list[str] = []
        self.buffer_lock = asyncio.Lock()
        self.running = False
        self.connection: Any = None
        self.ssl_context: ssl.SSLContext | None = None
        self.events_forwarded = 0
        self.last_error: str | None = None
        self.last_error_at: datetime | None = None

    async def start(self) -> None:
        """Start the forwarder."""
        logger.info(
            "Starting forwarder",
            name=self.config.name,
            target=f"{self.config.target_host}:{self.config.target_port}",
            protocol=self.config.protocol,
        )

        # Set up TLS if needed
        if self.config.protocol == "tls" or self.config.tls_enabled:
            self.ssl_context = ssl.create_default_context()
            if not self.config.tls_verify:
                self.ssl_context.check_hostname = False
                self.ssl_context.verify_mode = ssl.CERT_NONE

        self.running = True

        # Start flush task
        asyncio.create_task(self._flush_periodically())

    async def stop(self) -> None:
        """Stop the forwarder."""
        logger.info("Stopping forwarder", name=self.config.name)
        self.running = False

        # Flush remaining events
        await self._flush_buffer()

        # Close connection
        if self.connection:
            try:
                self.connection.close()
            except Exception:
                pass

    async def forward(self, event: dict[str, Any]) -> None:
        """
        Forward a syslog event.

        Events are buffered and sent in batches.
        """
        # Check filter criteria
        if not self._matches_filter(event):
            return

        # Format as syslog message
        message = self._format_syslog_message(event)

        # Add to buffer
        async with self.buffer_lock:
            self.buffer.append(message)

            if len(self.buffer) >= self.config.buffer_size:
                await self._flush_buffer()

    def _matches_filter(self, event: dict[str, Any]) -> bool:
        """Check if event matches filter criteria."""
        criteria = self.config.filter_criteria

        if not criteria:
            return True

        # Severity filter
        if "severity" in criteria:
            severities = criteria["severity"]
            if isinstance(severities, list):
                if event.get("severity") not in severities:
                    return False
            elif event.get("severity") != severities:
                return False

        # Facility filter
        if "facility" in criteria:
            facilities = criteria["facility"]
            if isinstance(facilities, list):
                if event.get("facility") not in facilities:
                    return False
            elif event.get("facility") != facilities:
                return False

        # Hostname filter
        if "hostname" in criteria:
            hostname_pattern = criteria["hostname"]
            event_hostname = event.get("hostname", "")
            if hostname_pattern not in event_hostname:
                return False

        # Device type filter
        if "device_type" in criteria:
            device_types = criteria["device_type"]
            if isinstance(device_types, list):
                if event.get("device_type") not in device_types:
                    return False
            elif event.get("device_type") != device_types:
                return False

        # Event type filter
        if "event_type" in criteria:
            event_types = criteria["event_type"]
            if isinstance(event_types, list):
                if event.get("event_type") not in event_types:
                    return False
            elif event.get("event_type") != event_types:
                return False

        return True

    def _format_syslog_message(self, event: dict[str, Any]) -> str:
        """Format event as RFC 5424 syslog message."""
        # Calculate PRI
        facility = event.get("facility", 1)
        severity = event.get("severity", 6)
        pri = (facility * 8) + severity

        # Timestamp
        timestamp = event.get("timestamp")
        if timestamp:
            if isinstance(timestamp, str):
                ts_str = timestamp
            else:
                ts_str = timestamp.isoformat()
        else:
            ts_str = datetime.utcnow().isoformat()

        # Build message
        hostname = event.get("hostname") or "-"
        app_name = event.get("app_name") or "-"
        proc_id = event.get("proc_id") or "-"
        msg_id = event.get("msg_id") or "-"
        message = event.get("message") or ""

        # RFC 5424 format
        return f"<{pri}>1 {ts_str} {hostname} {app_name} {proc_id} {msg_id} - {message}\n"

    async def _flush_buffer(self) -> None:
        """Flush buffered messages to target."""
        async with self.buffer_lock:
            if not self.buffer:
                return

            messages = self.buffer
            self.buffer = []

        # Send messages
        for message in messages:
            success = await self._send_message(message)
            if success:
                self.events_forwarded += 1
            else:
                # Re-add failed messages (up to buffer limit)
                async with self.buffer_lock:
                    if len(self.buffer) < self.config.buffer_size * 2:
                        self.buffer.insert(0, message)

    async def _send_message(self, message: str) -> bool:
        """Send a single message with retry."""
        for attempt in range(self.config.retry_count + 1):
            try:
                if self.config.protocol == "udp":
                    await self._send_udp(message)
                else:
                    await self._send_tcp(message)
                return True

            except Exception as e:
                self.last_error = str(e)
                self.last_error_at = datetime.utcnow()

                if attempt < self.config.retry_count:
                    delay = self.config.retry_delay_ms * (2**attempt) / 1000
                    logger.warning(
                        "Forwarder send failed, retrying",
                        name=self.config.name,
                        attempt=attempt + 1,
                        delay=delay,
                        error=str(e),
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "Forwarder send failed after retries",
                        name=self.config.name,
                        error=str(e),
                    )
                    return False

        return False

    async def _send_udp(self, message: str) -> None:
        """Send message via UDP."""
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.sendto(
                message.encode("utf-8"),
                (self.config.target_host, self.config.target_port),
            )
        finally:
            sock.close()

    async def _send_tcp(self, message: str) -> None:
        """Send message via TCP or TLS."""
        if self.ssl_context:
            reader, writer = await asyncio.open_connection(
                self.config.target_host,
                self.config.target_port,
                ssl=self.ssl_context,
            )
        else:
            reader, writer = await asyncio.open_connection(
                self.config.target_host,
                self.config.target_port,
            )

        try:
            writer.write(message.encode("utf-8"))
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    async def _flush_periodically(self) -> None:
        """Periodically flush buffer."""
        while self.running:
            await asyncio.sleep(5)
            await self._flush_buffer()


class ForwarderManager:
    """
    Manages multiple forwarders.

    Subscribes to NATS syslog events and distributes to configured forwarders.
    """

    def __init__(self) -> None:
        self.db_pool: asyncpg.Pool | None = None
        self.nats: NATSClient | None = None
        self.forwarders: dict[str, SyslogForwarder] = {}
        self.running = False

    async def start(self) -> None:
        """Start the forwarder manager."""
        logger.info("Starting forwarder manager")

        # Connect to database
        self.db_pool = await asyncpg.create_pool(
            dsn=settings.POSTGRES_URL,
            min_size=2,
            max_size=10,
        )

        # Connect to NATS
        self.nats = NATSClient()
        await self.nats.connect(servers=[settings.NATS_URL])

        # Load forwarder configurations
        await self._load_forwarders()

        # Subscribe to syslog events
        await self.nats.subscribe("syslog.events", cb=self._handle_event)

        self.running = True

        # Start config reload task
        asyncio.create_task(self._reload_config_periodically())

        logger.info("Forwarder manager started", forwarder_count=len(self.forwarders))

    async def stop(self) -> None:
        """Stop the forwarder manager."""
        logger.info("Stopping forwarder manager")
        self.running = False

        # Stop all forwarders
        for forwarder in self.forwarders.values():
            await forwarder.stop()

        if self.nats:
            await self.nats.close()

        if self.db_pool:
            await self.db_pool.close()

    async def _load_forwarders(self) -> None:
        """Load forwarder configurations from database."""
        if not self.db_pool:
            return

        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, name, target_host, target_port, protocol,
                       tls_enabled, tls_verify, filter_criteria,
                       buffer_size, retry_count, retry_delay_ms
                FROM syslog.forwarders
                WHERE is_active = true
                """
            )

        current_ids = set()
        for row in rows:
            forwarder_id = str(row["id"])
            current_ids.add(forwarder_id)

            # Skip if already running
            if forwarder_id in self.forwarders:
                continue

            config = ForwarderConfig(
                id=forwarder_id,
                name=row["name"],
                target_host=row["target_host"],
                target_port=row["target_port"],
                protocol=row["protocol"],
                tls_enabled=row["tls_enabled"],
                tls_verify=row["tls_verify"],
                filter_criteria=row["filter_criteria"] or {},
                buffer_size=row["buffer_size"],
                retry_count=row["retry_count"],
                retry_delay_ms=row["retry_delay_ms"],
            )

            forwarder = SyslogForwarder(config)
            await forwarder.start()
            self.forwarders[forwarder_id] = forwarder

        # Stop removed forwarders
        for forwarder_id in list(self.forwarders.keys()):
            if forwarder_id not in current_ids:
                await self.forwarders[forwarder_id].stop()
                del self.forwarders[forwarder_id]

    async def _handle_event(self, msg: Any) -> None:
        """Handle incoming syslog event from NATS."""
        try:
            event = json.loads(msg.data.decode())

            # Forward to all active forwarders
            for forwarder in self.forwarders.values():
                await forwarder.forward(event)

        except Exception as e:
            logger.error("Failed to handle syslog event", error=str(e))

    async def _reload_config_periodically(self) -> None:
        """Periodically reload forwarder configurations."""
        while self.running:
            await asyncio.sleep(60)  # Reload every minute
            await self._load_forwarders()

    async def _update_statistics(self) -> None:
        """Update forwarder statistics in database."""
        if not self.db_pool:
            return

        for forwarder_id, forwarder in self.forwarders.items():
            try:
                async with self.db_pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE syslog.forwarders
                        SET events_forwarded = $1,
                            last_forward_at = CASE WHEN $1 > 0 THEN NOW() ELSE last_forward_at END,
                            last_error = $2,
                            last_error_at = $3
                        WHERE id = $4::uuid
                        """,
                        forwarder.events_forwarded,
                        forwarder.last_error,
                        forwarder.last_error_at,
                        forwarder_id,
                    )
            except Exception as e:
                logger.error(
                    "Failed to update forwarder stats",
                    forwarder=forwarder.config.name,
                    error=str(e),
                )


async def main() -> None:
    """Main entry point for the forwarder service."""
    import signal

    manager = ForwarderManager()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(shutdown(manager)))

    try:
        await manager.start()
        while manager.running:
            await asyncio.sleep(1)
    finally:
        await manager.stop()


async def shutdown(manager: ForwarderManager) -> None:
    """Shutdown handler."""
    logger.info("Shutdown signal received")
    manager.running = False


if __name__ == "__main__":
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
    )

    asyncio.run(main())
