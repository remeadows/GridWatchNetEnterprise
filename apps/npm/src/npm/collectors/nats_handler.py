"""NATS JetStream handler for NPM service messaging."""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

import nats
from nats.js import JetStreamContext
from nats.js.api import ConsumerConfig, DeliverPolicy, AckPolicy

from ..core.config import settings
from ..core.logging import get_logger
from ..services.metrics import MetricsService
from ..models.device import DeviceStatus
from ..models.alert import AlertCreate, AlertSeverity

logger = get_logger(__name__)

# NATS subjects
SUBJECT_METRICS = "npm.metrics.*"
SUBJECT_DEVICE_STATUS = "npm.devices.status"
SUBJECT_INTERFACE_STATUS = "npm.interfaces.status"
SUBJECT_ALERTS = "shared.alerts.npm"
SUBJECT_POLL_REQUEST = "npm.poll.request"

# Stream configuration
STREAM_NAME = "NPM_METRICS"


class NATSHandler:
    """Handler for NATS JetStream messaging."""

    def __init__(self) -> None:
        self.nc: nats.NATS | None = None
        self.js: JetStreamContext | None = None
        self.metrics = MetricsService()
        self._running = False
        self._tasks: list[asyncio.Task] = []

    async def connect(self) -> None:
        """Connect to NATS server."""
        try:
            self.nc = await nats.connect(settings.nats_url)
            self.js = self.nc.jetstream()

            # Ensure stream exists
            try:
                await self.js.stream_info(STREAM_NAME)
                logger.info("jetstream_stream_found", stream=STREAM_NAME)
            except nats.js.errors.NotFoundError:
                logger.info("creating_jetstream_stream", stream=STREAM_NAME)
                await self.js.add_stream(
                    name=STREAM_NAME,
                    subjects=[
                        "npm.metrics.*",
                        "npm.devices.*",
                        "npm.interfaces.*",
                        "npm.poll.*",
                    ],
                    retention="limits",
                    max_msgs=1000000,
                    max_bytes=2 * 1024 * 1024 * 1024,  # 2GB
                    max_age=3600,  # 1 hour
                )

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

        # Consumer for poll requests
        poll_consumer = await self._create_consumer(
            SUBJECT_POLL_REQUEST,
            "npm-poll-worker",
            self._handle_poll_request,
        )
        self._tasks.append(poll_consumer)

        # Consumer for device status updates
        status_consumer = await self._create_consumer(
            SUBJECT_DEVICE_STATUS,
            "npm-status-handler",
            self._handle_device_status,
        )
        self._tasks.append(status_consumer)

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
                ack_wait=60,
            ),
        )

        async def consume():
            while self._running:
                try:
                    messages = await consumer.fetch(batch=10, timeout=5)
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

    async def _handle_poll_request(self, data: dict[str, Any]) -> None:
        """Handle a poll request message."""
        device_id = data.get("device_id")

        if not device_id:
            logger.warning("invalid_poll_request", data=data)
            return

        logger.info("processing_poll_request", device_id=device_id)

        # Trigger immediate poll for device
        # This would call the SNMPPoller to poll a specific device
        await self.publish_device_status({
            "device_id": device_id,
            "status": "polling",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def _handle_device_status(self, data: dict[str, Any]) -> None:
        """Handle device status update message."""
        device_id = data.get("device_id")
        status = data.get("status")
        previous_status = data.get("previous_status")

        if not device_id or not status:
            return

        logger.debug("device_status_update", device_id=device_id, status=status)

        # Check if status changed from UP to DOWN (trigger alert)
        if previous_status == DeviceStatus.UP.value and status == DeviceStatus.DOWN.value:
            await self.publish_alert({
                "device_id": device_id,
                "message": f"Device is no longer responding",
                "severity": AlertSeverity.CRITICAL.value,
                "details": {
                    "previous_status": previous_status,
                    "current_status": status,
                },
            })

    async def publish_metrics(self, metrics: dict[str, Any]) -> None:
        """Publish metrics to NATS for VictoriaMetrics consumption."""
        if not self.js:
            return

        subject = f"npm.metrics.{metrics.get('type', 'generic')}"
        await self.js.publish(
            subject,
            json.dumps(metrics).encode(),
        )

    async def publish_device_status(self, data: dict[str, Any]) -> None:
        """Publish device status update."""
        if not self.js:
            return

        await self.js.publish(
            SUBJECT_DEVICE_STATUS,
            json.dumps(data).encode(),
        )

    async def publish_interface_status(self, data: dict[str, Any]) -> None:
        """Publish interface status update."""
        if not self.js:
            return

        await self.js.publish(
            SUBJECT_INTERFACE_STATUS,
            json.dumps(data).encode(),
        )

    async def publish_alert(self, data: dict[str, Any]) -> None:
        """Publish alert to shared alerts stream."""
        if not self.nc:
            return

        # Publish to shared alerts subject (not JetStream - for immediate delivery)
        await self.nc.publish(
            SUBJECT_ALERTS,
            json.dumps({
                **data,
                "source": "npm",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }).encode(),
        )
        logger.info("alert_published", device_id=data.get("device_id"))

    async def request_poll(self, device_id: str) -> None:
        """Request immediate poll for a device."""
        if not self.js:
            raise RuntimeError("NATS not connected")

        await self.js.publish(
            SUBJECT_POLL_REQUEST,
            json.dumps({"device_id": device_id}).encode(),
        )
        logger.info("poll_request_published", device_id=device_id)
