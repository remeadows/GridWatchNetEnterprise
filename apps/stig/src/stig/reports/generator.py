"""Report generation orchestration."""

import asyncio
import json
import signal
from pathlib import Path

import nats
from nats.js import JetStreamContext

from ..core.config import settings
from ..core.logging import configure_logging, get_logger
from ..db.connection import init_db, close_db
from ..db.repository import (
    TargetRepository,
    DefinitionRepository,
    AuditJobRepository,
    AuditResultRepository,
)
from ..models import ReportFormat, AuditStatus
from ..services.audit import AuditService
from .ckl import CKLExporter
from .pdf import PDFExporter

logger = get_logger(__name__)


class ReportGenerator:
    """Service for generating STIG reports."""

    def __init__(self) -> None:
        """Initialize report generator."""
        self.output_dir = Path(settings.report_output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.ckl_exporter = CKLExporter()
        self.pdf_exporter = PDFExporter()
        self.audit_service = AuditService()

        self._nc: nats.NATS | None = None
        self._js: JetStreamContext | None = None
        self._running = False

    async def connect_nats(self) -> None:
        """Connect to NATS for job notifications."""
        try:
            self._nc = await nats.connect(settings.nats_url)
            self._js = self._nc.jetstream()
            logger.info("nats_connected", url=settings.nats_url)
        except Exception as e:
            logger.warning("nats_connection_failed", error=str(e))

    async def disconnect_nats(self) -> None:
        """Disconnect from NATS."""
        self._running = False
        if self._nc:
            await self._nc.drain()
            self._nc = None
            self._js = None

    async def generate(
        self,
        job_id: str,
        format: ReportFormat,
        include_details: bool = True,
        include_remediation: bool = True,
    ) -> Path:
        """Generate a report for an audit job.

        Args:
            job_id: ID of the completed audit job
            format: Report format (pdf, ckl, etc.)
            include_details: Include finding details
            include_remediation: Include fix guidance

        Returns:
            Path to the generated report file

        Raises:
            ValueError: If job not found or not completed
        """
        # Get job and related data
        job = await AuditJobRepository.get_by_id(job_id)
        if not job:
            raise ValueError(f"Job not found: {job_id}")

        if job.status != AuditStatus.COMPLETED:
            raise ValueError(f"Job not completed: {job.status}")

        target = await TargetRepository.get_by_id(job.target_id)
        definition = await DefinitionRepository.get_by_id(job.definition_id)

        if not target or not definition:
            raise ValueError("Target or definition not found")

        # Get all results
        results, _ = await AuditResultRepository.list_by_job(job_id, per_page=1000)

        # Generate based on format
        if format == ReportFormat.CKL:
            return self.ckl_exporter.export(
                job, target, definition, results, self.output_dir
            )
        elif format == ReportFormat.PDF:
            summary = await self.audit_service.get_compliance_summary(job_id)
            if not summary:
                raise ValueError("Could not generate compliance summary")

            return self.pdf_exporter.export(
                job,
                target,
                definition,
                results,
                summary,
                self.output_dir,
                include_details,
                include_remediation,
            )
        elif format == ReportFormat.JSON:
            return await self._export_json(job_id, results)
        else:
            raise ValueError(f"Unsupported format: {format}")

    async def _export_json(self, job_id: str, results: list) -> Path:
        """Export results to JSON format."""
        output_file = self.output_dir / f"{job_id}.json"

        data = {
            "job_id": job_id,
            "generated_at": str(datetime.utcnow()),
            "results": [r.model_dump() for r in results],
        }

        with open(output_file, "w") as f:
            json.dump(data, f, indent=2, default=str)

        logger.info("json_exported", job_id=job_id, path=str(output_file))
        return output_file

    async def start_consumer(self) -> None:
        """Start consuming report generation requests from NATS."""
        if not self._js:
            logger.warning("nats_not_connected")
            return

        self._running = True

        try:
            sub = await self._js.subscribe(
                "stig.results.*",
                durable="report-generator",
            )

            logger.info("report_consumer_started", subject="stig.results.*")

            while self._running:
                try:
                    msgs = await sub.fetch(batch=1, timeout=5)
                    for msg in msgs:
                        await self._process_completion(msg)
                except nats.errors.TimeoutError:
                    continue
                except Exception as e:
                    logger.error("report_processing_error", error=str(e))

        except Exception as e:
            logger.error("report_consumer_failed", error=str(e))

    async def _process_completion(self, msg: nats.aio.msg.Msg) -> None:
        """Process audit completion and generate reports if configured."""
        try:
            data = json.loads(msg.data.decode())
            job_id = data.get("job_id")

            if not job_id:
                await msg.ack()
                return

            logger.info("audit_completed_notification", job_id=job_id)

            # Auto-generate CKL for completed audits
            try:
                await self.generate(job_id, ReportFormat.CKL)
            except Exception as e:
                logger.error("auto_ckl_generation_failed", job_id=job_id, error=str(e))

            await msg.ack()

        except Exception as e:
            logger.error("completion_processing_failed", error=str(e))
            await msg.nak()


from datetime import datetime


async def main() -> None:
    """Main entry point for report generator worker."""
    configure_logging()
    logger.info("starting_report_generator")

    # Initialize database
    await init_db()

    # Create generator
    generator = ReportGenerator()
    await generator.connect_nats()

    # Setup signal handlers
    stop_event = asyncio.Event()

    def signal_handler():
        logger.info("shutdown_signal_received")
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    # Start consumer
    consumer_task = asyncio.create_task(generator.start_consumer())

    # Wait for shutdown
    await stop_event.wait()

    # Cleanup
    await generator.disconnect_nats()
    consumer_task.cancel()
    await close_db()

    logger.info("report_generator_stopped")


if __name__ == "__main__":
    asyncio.run(main())
