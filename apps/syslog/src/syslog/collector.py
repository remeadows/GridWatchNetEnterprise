"""
Syslog UDP/TCP collector service.

Listens on UDP/TCP port 514 (configurable) and processes incoming syslog messages.
"""

import asyncio
import json
import signal
import sys
from datetime import datetime
from typing import Any
from uuid import uuid4

import asyncpg
import structlog
from nats.aio.client import Client as NATSClient

from .config import settings
from .parser import parse_syslog_message, ParsedSyslogMessage

logger = structlog.get_logger()


class SyslogCollector:
    """
    Syslog collector that listens on UDP 514.

    Features:
    - UDP and TCP syslog reception
    - Device and event type parsing
    - Database storage with 10GB circular buffer management
    - Real-time streaming via NATS JetStream
    """

    def __init__(self) -> None:
        self.db_pool: asyncpg.Pool | None = None
        self.nats: NATSClient | None = None
        self.udp_transport: asyncio.DatagramTransport | None = None
        self.running = False
        self.buffer_check_interval = 300  # Check buffer every 5 minutes
        self.batch_size = 100  # Batch insert size
        self.event_buffer: list[dict[str, Any]] = []
        self.buffer_lock = asyncio.Lock()

    async def start(self) -> None:
        """Start the syslog collector."""
        logger.info("Starting syslog collector", udp_port=settings.SYSLOG_UDP_PORT)

        # Connect to database
        self.db_pool = await asyncpg.create_pool(
            dsn=settings.POSTGRES_URL,
            min_size=5,
            max_size=20,
        )
        logger.info("Connected to PostgreSQL")

        # Connect to NATS
        self.nats = NATSClient()
        await self.nats.connect(servers=[settings.NATS_URL])
        logger.info("Connected to NATS")

        # Start UDP server
        loop = asyncio.get_event_loop()
        self.udp_transport, _ = await loop.create_datagram_endpoint(
            lambda: SyslogUDPProtocol(self),
            local_addr=("0.0.0.0", settings.SYSLOG_UDP_PORT),
        )
        logger.info("UDP listener started", port=settings.SYSLOG_UDP_PORT)

        self.running = True

        # Start background tasks
        asyncio.create_task(self.flush_buffer_periodically())
        asyncio.create_task(self.check_buffer_size_periodically())

    async def stop(self) -> None:
        """Stop the syslog collector."""
        logger.info("Stopping syslog collector")
        self.running = False

        # Flush remaining events
        await self.flush_buffer()

        if self.udp_transport:
            self.udp_transport.close()

        if self.nats:
            await self.nats.close()

        if self.db_pool:
            await self.db_pool.close()

        logger.info("Syslog collector stopped")

    async def process_message(self, data: bytes, addr: tuple[str, int]) -> None:
        """Process an incoming syslog message."""
        try:
            raw_message = data.decode("utf-8", errors="replace").strip()
            source_ip = addr[0]

            # Parse the message
            parsed = parse_syslog_message(raw_message)

            # Create event record
            event = {
                "id": str(uuid4()),
                "source_ip": source_ip,
                "received_at": datetime.utcnow(),
                "facility": parsed.facility,
                "severity": parsed.severity,
                "version": parsed.version,
                "timestamp": parsed.timestamp,
                "hostname": parsed.hostname,
                "app_name": parsed.app_name,
                "proc_id": parsed.proc_id,
                "msg_id": parsed.msg_id,
                "structured_data": parsed.structured_data,
                "message": parsed.message,
                "device_type": parsed.device_type,
                "event_type": parsed.event_type,
                "raw_message": raw_message,
            }

            # Add to buffer
            async with self.buffer_lock:
                self.event_buffer.append(event)
                if len(self.event_buffer) >= self.batch_size:
                    await self._flush_buffer_internal()

            # Publish to NATS for real-time streaming
            await self._publish_to_nats(event, parsed)

        except Exception as e:
            logger.error("Failed to process syslog message", error=str(e), addr=addr)

    async def _publish_to_nats(self, event: dict[str, Any], parsed: ParsedSyslogMessage) -> None:
        """Publish event to NATS for real-time streaming."""
        if not self.nats:
            return

        try:
            # Prepare NATS message (convert datetime to ISO string)
            nats_event = {
                **event,
                "received_at": event["received_at"].isoformat(),
                "timestamp": event["timestamp"].isoformat() if event["timestamp"] else None,
            }

            # Publish to general syslog subject
            await self.nats.publish(
                "syslog.events",
                json.dumps(nats_event).encode(),
            )

            # Publish to severity-specific subject for alerts
            if parsed.severity <= 3:  # Critical and above
                await self.nats.publish(
                    f"syslog.alerts.{parsed.severity}",
                    json.dumps(nats_event).encode(),
                )

        except Exception as e:
            logger.error("Failed to publish to NATS", error=str(e))

    async def flush_buffer(self) -> None:
        """Flush the event buffer to the database."""
        async with self.buffer_lock:
            await self._flush_buffer_internal()

    async def _flush_buffer_internal(self) -> None:
        """Internal flush method (must be called with lock held)."""
        if not self.event_buffer or not self.db_pool:
            return

        events = self.event_buffer
        self.event_buffer = []

        try:
            # First, look up or create source records
            source_ids = await self._get_or_create_sources(events)

            # Batch insert events
            async with self.db_pool.acquire() as conn:
                await conn.executemany(
                    """
                    INSERT INTO syslog.events (
                        id, source_id, source_ip, received_at, facility, severity,
                        version, timestamp, hostname, app_name, proc_id, msg_id,
                        structured_data, message, device_type, event_type, raw_message
                    ) VALUES (
                        $1::uuid, $2::uuid, $3::inet, $4, $5, $6, $7, $8, $9, $10,
                        $11, $12, $13::jsonb, $14, $15, $16, $17
                    )
                    """,
                    [
                        (
                            e["id"],
                            source_ids.get(e["source_ip"]),
                            e["source_ip"],
                            e["received_at"],
                            e["facility"],
                            e["severity"],
                            e["version"],
                            e["timestamp"],
                            e["hostname"],
                            e["app_name"],
                            e["proc_id"],
                            e["msg_id"],
                            json.dumps(e["structured_data"]) if e["structured_data"] else None,
                            e["message"],
                            e["device_type"],
                            e["event_type"],
                            e["raw_message"],
                        )
                        for e in events
                    ],
                )

                # Update source statistics
                for source_ip, source_id in source_ids.items():
                    if source_id:
                        count = sum(1 for e in events if e["source_ip"] == source_ip)
                        await conn.execute(
                            """
                            UPDATE syslog.sources
                            SET events_received = events_received + $1,
                                last_event_at = NOW()
                            WHERE id = $2
                            """,
                            count,
                            source_id,
                        )

            logger.debug("Flushed events to database", count=len(events))

        except Exception as e:
            logger.error("Failed to flush events to database", error=str(e))
            # Re-add events to buffer on failure (with limit)
            if len(self.event_buffer) < self.batch_size * 10:
                self.event_buffer = events + self.event_buffer

    async def _get_or_create_sources(
        self, events: list[dict[str, Any]]
    ) -> dict[str, str | None]:
        """Get or create source records for events."""
        source_ids: dict[str, str | None] = {}

        if not self.db_pool:
            return source_ids

        # Get unique source IPs
        source_ips = set(e["source_ip"] for e in events)

        async with self.db_pool.acquire() as conn:
            for source_ip in source_ips:
                # Try to find existing source
                row = await conn.fetchrow(
                    "SELECT id FROM syslog.sources WHERE ip_address = $1::inet",
                    source_ip,
                )

                if row:
                    source_ids[source_ip] = str(row["id"])
                else:
                    # Auto-create source from first event with this IP
                    event = next(e for e in events if e["source_ip"] == source_ip)
                    hostname = event.get("hostname") or source_ip
                    device_type = event.get("device_type")

                    try:
                        result = await conn.fetchrow(
                            """
                            INSERT INTO syslog.sources (name, ip_address, hostname, device_type)
                            VALUES ($1, $2::inet, $3, $4)
                            ON CONFLICT (ip_address) DO UPDATE SET updated_at = NOW()
                            RETURNING id
                            """,
                            hostname,
                            source_ip,
                            hostname,
                            device_type,
                        )
                        source_ids[source_ip] = str(result["id"])
                    except Exception:
                        source_ids[source_ip] = None

        return source_ids

    async def flush_buffer_periodically(self) -> None:
        """Periodically flush the event buffer."""
        while self.running:
            await asyncio.sleep(5)  # Flush every 5 seconds
            await self.flush_buffer()

    async def check_buffer_size_periodically(self) -> None:
        """Periodically check and manage the 10GB circular buffer."""
        while self.running:
            await asyncio.sleep(self.buffer_check_interval)
            await self._manage_buffer_size()

    async def _manage_buffer_size(self) -> None:
        """
        Manage the circular buffer size.

        When buffer exceeds threshold, delete oldest events to make room.
        """
        if not self.db_pool:
            return

        try:
            async with self.db_pool.acquire() as conn:
                # Get current buffer settings
                settings_row = await conn.fetchrow(
                    """
                    SELECT max_size_bytes, cleanup_threshold_percent, retention_days
                    FROM syslog.buffer_settings
                    WHERE id = 1
                    """
                )

                if not settings_row:
                    return

                max_size_bytes = settings_row["max_size_bytes"]
                threshold_pct = settings_row["cleanup_threshold_percent"]
                retention_days = settings_row["retention_days"]

                # Calculate current size
                size_row = await conn.fetchrow(
                    """
                    SELECT pg_total_relation_size('syslog.events') as size
                    """
                )
                current_size = size_row["size"] if size_row else 0

                # Update current size in settings
                await conn.execute(
                    """
                    UPDATE syslog.buffer_settings
                    SET current_size_bytes = $1, updated_at = NOW()
                    WHERE id = 1
                    """,
                    current_size,
                )

                threshold_bytes = max_size_bytes * threshold_pct / 100

                if current_size > threshold_bytes:
                    logger.warning(
                        "Buffer threshold exceeded, cleaning up",
                        current_size_gb=current_size / 1073741824,
                        threshold_gb=threshold_bytes / 1073741824,
                    )

                    # Delete oldest events (10% of max size worth)
                    # First by retention, then by oldest
                    deleted = await conn.execute(
                        """
                        DELETE FROM syslog.events
                        WHERE received_at < NOW() - INTERVAL '%s days'
                        OR id IN (
                            SELECT id FROM syslog.events
                            ORDER BY received_at ASC
                            LIMIT 100000
                        )
                        """,
                        retention_days,
                    )

                    # Update cleanup timestamp
                    await conn.execute(
                        """
                        UPDATE syslog.buffer_settings
                        SET last_cleanup_at = NOW()
                        WHERE id = 1
                        """
                    )

                    logger.info(
                        "Buffer cleanup completed",
                        deleted_count=deleted.split()[-1] if deleted else 0,
                    )

        except Exception as e:
            logger.error("Failed to manage buffer size", error=str(e))


class SyslogUDPProtocol(asyncio.DatagramProtocol):
    """Asyncio UDP protocol for syslog reception."""

    def __init__(self, collector: SyslogCollector) -> None:
        self.collector = collector

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        """Handle incoming UDP datagram."""
        asyncio.create_task(self.collector.process_message(data, addr))

    def error_received(self, exc: Exception) -> None:
        """Handle UDP errors."""
        logger.error("UDP error received", error=str(exc))


async def main() -> None:
    """Main entry point for the syslog collector."""
    collector = SyslogCollector()

    # Set up signal handlers
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(shutdown(collector)))

    try:
        await collector.start()
        # Keep running
        while collector.running:
            await asyncio.sleep(1)
    finally:
        await collector.stop()


async def shutdown(collector: SyslogCollector) -> None:
    """Shutdown handler."""
    logger.info("Shutdown signal received")
    collector.running = False


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

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Collector terminated by user")
        sys.exit(0)
