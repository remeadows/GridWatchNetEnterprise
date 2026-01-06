"""NATS JetStream handler for audit job processing."""

import asyncio
import json
import signal

import nats
from nats.js import JetStreamContext
from nats.js.api import ConsumerConfig, DeliverPolicy

from ..core.config import settings
from ..core.logging import configure_logging, get_logger
from ..db.connection import init_db, close_db
from ..db.repository import (
    TargetRepository,
    DefinitionRepository,
    AuditJobRepository,
    AuditResultRepository,
)
from ..models import AuditStatus
from .ssh_auditor import SSHAuditor

logger = get_logger(__name__)


class NATSHandler:
    """NATS JetStream handler for processing audit jobs."""

    def __init__(self) -> None:
        """Initialize NATS handler."""
        self._nc: nats.NATS | None = None
        self._js: JetStreamContext | None = None
        self._running = False
        self._ssh_auditor: SSHAuditor | None = None

    async def connect(self) -> None:
        """Connect to NATS server."""
        try:
            self._nc = await nats.connect(settings.nats_url)
            self._js = self._nc.jetstream()
            self._ssh_auditor = SSHAuditor()
            logger.info("nats_connected", url=settings.nats_url)
        except Exception as e:
            logger.error("nats_connection_failed", error=str(e))
            raise

    async def disconnect(self) -> None:
        """Disconnect from NATS."""
        self._running = False

        if self._ssh_auditor:
            await self._ssh_auditor.close()

        if self._nc:
            await self._nc.drain()
            self._nc = None
            self._js = None

        logger.info("nats_disconnected")

    async def start_consumers(self) -> None:
        """Start consuming audit job messages."""
        if not self._js:
            raise RuntimeError("NATS not connected")

        self._running = True

        # Subscribe to audit jobs stream
        try:
            # Create or get consumer
            consumer_config = ConsumerConfig(
                durable_name="audit-job-processor",
                deliver_policy=DeliverPolicy.ALL,
                ack_wait=300,  # 5 minutes for long audits
                max_deliver=3,
            )

            sub = await self._js.subscribe(
                "stig.audits.*",
                durable="audit-job-processor",
                config=consumer_config,
            )

            logger.info("consumer_started", subject="stig.audits.*")

            while self._running:
                try:
                    msgs = await sub.fetch(batch=1, timeout=5)
                    for msg in msgs:
                        await self._process_audit_job(msg)
                except nats.errors.TimeoutError:
                    # No messages, continue polling
                    continue
                except Exception as e:
                    logger.error("message_processing_error", error=str(e))

        except Exception as e:
            logger.error("consumer_start_failed", error=str(e))
            raise

    async def _process_audit_job(self, msg: nats.aio.msg.Msg) -> None:
        """Process a single audit job message.

        Args:
            msg: NATS message containing job details
        """
        try:
            data = json.loads(msg.data.decode())
            job_id = data.get("job_id")

            if not job_id:
                logger.warning("invalid_message", data=data)
                await msg.ack()
                return

            logger.info("processing_audit_job", job_id=job_id)

            # Get job details
            job = await AuditJobRepository.get_by_id(job_id)
            if not job:
                logger.warning("job_not_found", job_id=job_id)
                await msg.ack()
                return

            # Update status to running
            await AuditJobRepository.update_status(job_id, AuditStatus.RUNNING)

            # Get target and definition
            target = await TargetRepository.get_by_id(job.target_id)
            definition = await DefinitionRepository.get_by_id(job.definition_id)

            if not target or not definition:
                await AuditJobRepository.update_status(
                    job_id,
                    AuditStatus.FAILED,
                    "Target or definition not found",
                )
                await msg.ack()
                return

            # Run the audit
            if self._ssh_auditor:
                results = await self._ssh_auditor.audit_target(target, definition, job_id)

                # Save results
                if results:
                    await AuditResultRepository.bulk_create(results)

                # Update target last audit timestamp
                await TargetRepository.update_last_audit(target.id)

            # Mark job as completed
            await AuditJobRepository.update_status(job_id, AuditStatus.COMPLETED)
            logger.info("audit_job_completed", job_id=job_id, results_count=len(results) if results else 0)

            # Publish completion event
            if self._js:
                await self._js.publish(
                    f"stig.results.{job_id}",
                    json.dumps({"job_id": job_id, "status": "completed"}).encode(),
                )

            await msg.ack()

        except Exception as e:
            logger.error("audit_job_failed", error=str(e))

            # Try to update job status
            try:
                job_id = json.loads(msg.data.decode()).get("job_id")
                if job_id:
                    await AuditJobRepository.update_status(
                        job_id,
                        AuditStatus.FAILED,
                        str(e),
                    )
            except Exception:
                pass

            # Negative ack to retry
            await msg.nak()


async def main() -> None:
    """Main entry point for NATS consumer worker."""
    configure_logging()
    logger.info("starting_stig_collector")

    # Initialize database
    await init_db()

    # Create and connect handler
    handler = NATSHandler()
    await handler.connect()

    # Setup signal handlers
    stop_event = asyncio.Event()

    def signal_handler():
        logger.info("shutdown_signal_received")
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    # Start consumer in background
    consumer_task = asyncio.create_task(handler.start_consumers())

    # Wait for shutdown signal
    await stop_event.wait()

    # Cleanup
    await handler.disconnect()
    consumer_task.cancel()
    await close_db()

    logger.info("stig_collector_stopped")


if __name__ == "__main__":
    asyncio.run(main())
