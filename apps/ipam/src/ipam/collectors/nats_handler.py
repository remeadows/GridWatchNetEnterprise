"""NATS JetStream handler for async scan processing."""

import asyncio
import json
from typing import Any, Callable, Coroutine

import nats
from nats.js import JetStreamContext
from nats.js.api import ConsumerConfig, DeliverPolicy, AckPolicy

from ..core.config import settings
from ..core.logging import get_logger
from ..services.scanner import ScannerService
from ..services.metrics import MetricsService
from ..models.scan import ScanType

logger = get_logger(__name__)

# NATS subjects
SUBJECT_SCAN_REQUEST = "ipam.scan.request"
SUBJECT_SCAN_PROGRESS = "ipam.scan.progress"
SUBJECT_SCAN_COMPLETE = "ipam.scan.complete"
SUBJECT_DISCOVERY = "ipam.discovery.result"

# Stream configuration
STREAM_NAME = "IPAM"


class NATSHandler:
    """Handler for NATS JetStream messaging."""

    def __init__(self) -> None:
        self.nc: nats.NATS | None = None
        self.js: JetStreamContext | None = None
        self.scanner = ScannerService()
        self.metrics = MetricsService()
        self._running = False
        self._tasks: list[asyncio.Task] = []

    async def connect(self) -> None:
        """Connect to NATS server."""
        try:
            # Build connection options
            connect_opts: dict = {"servers": settings.nats_url}

            # Add authentication if configured
            if settings.nats_user and settings.nats_password:
                connect_opts["user"] = settings.nats_user
                connect_opts["password"] = settings.nats_password
                logger.info("nats_auth_enabled", user=settings.nats_user)

            # Add TLS if configured
            if settings.nats_tls_enabled:
                import ssl
                tls_ctx = ssl.create_default_context()
                if settings.nats_tls_ca:
                    tls_ctx.load_verify_locations(settings.nats_tls_ca)
                connect_opts["tls"] = tls_ctx
                logger.info("nats_tls_enabled")

            self.nc = await nats.connect(**connect_opts)
            self.js = self.nc.jetstream()

            # Ensure stream exists or update it
            try:
                stream_info = await self.js.stream_info(STREAM_NAME)
                logger.info("stream_exists", stream=STREAM_NAME, subjects=stream_info.config.subjects)
            except nats.js.errors.NotFoundError:
                logger.info("creating_jetstream_stream", stream=STREAM_NAME)
                try:
                    await self.js.add_stream(
                        name=STREAM_NAME,
                        subjects=[
                            "ipam.scan.*",
                            "ipam.discovery.*",
                        ],
                        retention="limits",
                        max_msgs=100000,
                        max_age=86400 * 7,  # 7 days
                    )
                except nats.js.errors.BadRequestError as e:
                    # Stream might exist with overlapping subjects from another service
                    logger.warning("stream_creation_conflict", error=str(e))

            logger.info("nats_connected", url=settings.nats_url)
        except Exception as e:
            logger.error("nats_connection_failed", error=str(e))
            raise

    async def disconnect(self) -> None:
        """Disconnect from NATS server."""
        self._running = False

        # Cancel all running tasks
        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        if self.nc:
            await self.nc.drain()
            await self.nc.close()
            logger.info("nats_disconnected")

        await self.metrics.close()

    async def start_consumers(self) -> None:
        """Start message consumers."""
        if not self.js:
            raise RuntimeError("NATS not connected")

        self._running = True

        # Consumer for scan requests
        scan_consumer = await self._create_consumer(
            SUBJECT_SCAN_REQUEST,
            "ipam-scan-worker",
            self._handle_scan_request,
        )
        self._tasks.append(scan_consumer)

        logger.info("nats_consumers_started")

    async def _create_consumer(
        self,
        subject: str,
        name: str,
        handler: Callable[[dict[str, Any]], Coroutine[Any, Any, None]],
    ) -> asyncio.Task:
        """Create a pull consumer for a subject."""
        if not self.js:
            raise RuntimeError("NATS not connected")

        # Create durable consumer
        consumer = await self.js.pull_subscribe(
            subject,
            durable=name,
            config=ConsumerConfig(
                deliver_policy=DeliverPolicy.ALL,
                ack_policy=AckPolicy.EXPLICIT,
                max_deliver=3,
                ack_wait=300,  # 5 minutes for long scans
            ),
        )

        async def consume():
            while self._running:
                try:
                    messages = await consumer.fetch(batch=1, timeout=5)
                    for msg in messages:
                        try:
                            data = json.loads(msg.data.decode())
                            await handler(data)
                            await msg.ack()
                        except Exception as e:
                            logger.error(
                                "message_processing_failed",
                                subject=subject,
                                error=str(e),
                            )
                            await msg.nak()
                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    logger.error("consumer_error", subject=subject, error=str(e))
                    await asyncio.sleep(1)

        return asyncio.create_task(consume())

    async def _handle_scan_request(self, data: dict[str, Any]) -> None:
        """Handle a scan request message."""
        network_id = data.get("network_id")
        scan_type = ScanType(data.get("scan_type", "ping"))

        if not network_id:
            logger.warning("invalid_scan_request", data=data)
            return

        logger.info("processing_scan_request", network_id=network_id, scan_type=scan_type.value)

        try:
            # Start the scan
            scan_job = await self.scanner.start_scan(network_id, scan_type)

            # Run the scan
            result = await self.scanner.run_scan(scan_job.id)

            # Publish completion message
            await self.publish_scan_complete(result.model_dump())

            # Push metrics
            await self.metrics.push_scan_metrics(
                network_id=network_id,
                network_name=data.get("network_name", "unknown"),
                scan_type=scan_type.value,
                duration_seconds=result.duration_seconds,
                total_ips=result.total_ips,
                active_ips=result.active_ips,
                new_ips=result.new_ips,
            )

        except Exception as e:
            logger.error("scan_processing_failed", network_id=network_id, error=str(e))
            await self.publish_scan_complete({
                "network_id": network_id,
                "status": "failed",
                "error": str(e),
            })

    async def publish_scan_request(
        self,
        network_id: str,
        network_name: str,
        scan_type: str = "ping",
    ) -> None:
        """Publish a scan request to the queue."""
        if not self.js:
            raise RuntimeError("NATS not connected")

        await self.js.publish(
            SUBJECT_SCAN_REQUEST,
            json.dumps({
                "network_id": network_id,
                "network_name": network_name,
                "scan_type": scan_type,
            }).encode(),
        )
        logger.info("scan_request_published", network_id=network_id)

    async def publish_scan_progress(self, data: dict[str, Any]) -> None:
        """Publish scan progress update."""
        if not self.js:
            return

        await self.js.publish(
            SUBJECT_SCAN_PROGRESS,
            json.dumps(data).encode(),
        )

    async def publish_scan_complete(self, data: dict[str, Any]) -> None:
        """Publish scan completion event."""
        if not self.js:
            return

        await self.js.publish(
            SUBJECT_SCAN_COMPLETE,
            json.dumps(data).encode(),
        )

    async def publish_discovery(self, data: dict[str, Any]) -> None:
        """Publish IP discovery result."""
        if not self.js:
            return

        await self.js.publish(
            SUBJECT_DISCOVERY,
            json.dumps(data).encode(),
        )


async def main() -> None:
    """Main entry point for running the NATS handler as a standalone service."""
    from ..core.logging import configure_logging
    from ..db import init_db, close_db

    configure_logging()
    logger.info("starting_ipam_scanner_service")

    await init_db()

    handler = NATSHandler()
    await handler.connect()
    await handler.start_consumers()

    try:
        # Keep running until interrupted
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("shutting_down_ipam_scanner")
    finally:
        await handler.disconnect()
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
