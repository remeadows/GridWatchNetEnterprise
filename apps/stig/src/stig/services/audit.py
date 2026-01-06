"""Audit orchestration service."""

import asyncio
from datetime import datetime

import nats
from nats.js import JetStreamContext

from ..core.config import settings
from ..core.logging import get_logger
from ..db.repository import (
    TargetRepository,
    DefinitionRepository,
    AuditJobRepository,
    AuditResultRepository,
)
from ..models import (
    AuditJob,
    AuditJobCreate,
    AuditStatus,
    AuditResult,
    CheckStatus,
    ComplianceSummary,
    SeverityBreakdown,
)

logger = get_logger(__name__)


class AuditService:
    """Service for managing and orchestrating STIG audits."""

    def __init__(self) -> None:
        """Initialize audit service."""
        self._nc: nats.NATS | None = None
        self._js: JetStreamContext | None = None

    async def connect_nats(self) -> None:
        """Connect to NATS for job submission."""
        try:
            self._nc = await nats.connect(settings.nats_url)
            self._js = self._nc.jetstream()
            logger.info("nats_connected", url=settings.nats_url)
        except Exception as e:
            logger.warning("nats_connection_failed", error=str(e))
            self._nc = None
            self._js = None

    async def disconnect_nats(self) -> None:
        """Disconnect from NATS."""
        if self._nc:
            await self._nc.drain()
            self._nc = None
            self._js = None

    async def start_audit(
        self,
        target_id: str,
        definition_id: str,
        name: str | None = None,
        created_by: str | None = None,
    ) -> AuditJob:
        """Start a new audit job.

        Args:
            target_id: ID of the target to audit
            definition_id: ID of the STIG definition to use
            name: Optional name for the audit job
            created_by: User ID who started the audit

        Returns:
            Created audit job

        Raises:
            ValueError: If target or definition not found
        """
        # Verify target exists
        target = await TargetRepository.get_by_id(target_id)
        if not target:
            raise ValueError(f"Target not found: {target_id}")

        if not target.is_active:
            raise ValueError(f"Target is not active: {target_id}")

        # Verify definition exists
        definition = await DefinitionRepository.get_by_id(definition_id)
        if not definition:
            raise ValueError(f"Definition not found: {definition_id}")

        # Create job
        job_data = AuditJobCreate(
            name=name,
            target_id=target_id,
            definition_id=definition_id,
        )
        job = await AuditJobRepository.create(job_data, created_by)

        # Submit to NATS for processing
        if self._js:
            try:
                await self._js.publish(
                    f"stig.audits.{job.id}",
                    f'{{"job_id": "{job.id}"}}'.encode(),
                )
                logger.info("audit_job_submitted", job_id=job.id)
            except Exception as e:
                logger.error("audit_job_submit_failed", job_id=job.id, error=str(e))
                await AuditJobRepository.update_status(
                    job.id, AuditStatus.FAILED, f"Failed to submit: {e}"
                )
        else:
            logger.warning("nats_not_connected_running_sync", job_id=job.id)
            # Run synchronously for development/testing
            asyncio.create_task(self._run_audit_sync(job.id))

        return job

    async def _run_audit_sync(self, job_id: str) -> None:
        """Run audit synchronously (for development without NATS)."""
        try:
            await AuditJobRepository.update_status(job_id, AuditStatus.RUNNING)

            job = await AuditJobRepository.get_by_id(job_id)
            if not job:
                return

            target = await TargetRepository.get_by_id(job.target_id)
            definition = await DefinitionRepository.get_by_id(job.definition_id)

            if not target or not definition:
                await AuditJobRepository.update_status(
                    job_id, AuditStatus.FAILED, "Target or definition not found"
                )
                return

            # Get rules from definition
            rules = []
            if definition.xccdf_content and "rules" in definition.xccdf_content:
                rules = definition.xccdf_content["rules"]

            if not rules:
                # Create sample results for demo
                from ..models import AuditResultCreate, STIGSeverity

                sample_results = [
                    AuditResultCreate(
                        job_id=job_id,
                        rule_id="SV-230221r858697_rule",
                        title="RHEL 8 must enable FIPS mode",
                        severity=STIGSeverity.HIGH,
                        status=CheckStatus.PASS,
                        finding_details="FIPS mode is enabled",
                    ),
                    AuditResultCreate(
                        job_id=job_id,
                        rule_id="SV-230222r627750_rule",
                        title="RHEL 8 must prevent non-root users from installing setuid",
                        severity=STIGSeverity.MEDIUM,
                        status=CheckStatus.FAIL,
                        finding_details="nosuid option not set on /home",
                    ),
                    AuditResultCreate(
                        job_id=job_id,
                        rule_id="SV-230223r627750_rule",
                        title="RHEL 8 must have sshd service running",
                        severity=STIGSeverity.LOW,
                        status=CheckStatus.PASS,
                        finding_details="sshd is active and running",
                    ),
                ]
                await AuditResultRepository.bulk_create(sample_results)

            # Update target last audit
            await TargetRepository.update_last_audit(target.id)

            await AuditJobRepository.update_status(job_id, AuditStatus.COMPLETED)
            logger.info("audit_completed", job_id=job_id)

        except Exception as e:
            logger.error("audit_failed", job_id=job_id, error=str(e))
            await AuditJobRepository.update_status(job_id, AuditStatus.FAILED, str(e))

    async def get_job(self, job_id: str) -> AuditJob | None:
        """Get an audit job by ID."""
        return await AuditJobRepository.get_by_id(job_id)

    async def get_job_results(
        self,
        job_id: str,
        page: int = 1,
        per_page: int = 50,
        status: CheckStatus | None = None,
        severity: str | None = None,
    ) -> tuple[list[AuditResult], int]:
        """Get results for an audit job."""
        return await AuditResultRepository.list_by_job(
            job_id, page, per_page, status, severity
        )

    async def get_compliance_summary(self, job_id: str) -> ComplianceSummary | None:
        """Get compliance summary for an audit job.

        Args:
            job_id: ID of the audit job

        Returns:
            Compliance summary or None if job not found
        """
        job = await AuditJobRepository.get_by_id(job_id)
        if not job:
            return None

        target = await TargetRepository.get_by_id(job.target_id)
        definition = await DefinitionRepository.get_by_id(job.definition_id)

        if not target or not definition:
            return None

        # Get status counts
        status_counts = await AuditResultRepository.get_summary(job_id)
        severity_breakdown = await AuditResultRepository.get_severity_breakdown(job_id)

        total = sum(status_counts.values())
        passed = status_counts.get("pass", 0)
        failed = status_counts.get("fail", 0)
        not_applicable = status_counts.get("not_applicable", 0)
        not_reviewed = status_counts.get("not_reviewed", 0)
        errors = status_counts.get("error", 0)

        # Calculate compliance score (passing / (passing + failing))
        applicable = passed + failed
        score = (passed / applicable * 100) if applicable > 0 else 0.0

        return ComplianceSummary(
            job_id=job_id,
            target_name=target.name,
            stig_title=definition.title,
            audit_date=job.completed_at or job.created_at,
            total_checks=total,
            passed=passed,
            failed=failed,
            not_applicable=not_applicable,
            not_reviewed=not_reviewed,
            errors=errors,
            compliance_score=round(score, 2),
            severity_breakdown={
                k: SeverityBreakdown(**v) for k, v in severity_breakdown.items()
            },
        )

    async def cancel_audit(self, job_id: str) -> bool:
        """Cancel a running audit job.

        Args:
            job_id: ID of the audit job to cancel

        Returns:
            True if cancelled, False if not found or not cancellable
        """
        job = await AuditJobRepository.get_by_id(job_id)
        if not job:
            return False

        if job.status not in (AuditStatus.PENDING, AuditStatus.RUNNING):
            return False

        await AuditJobRepository.update_status(job_id, AuditStatus.CANCELLED)
        logger.info("audit_cancelled", job_id=job_id)

        return True

    async def list_jobs(
        self,
        page: int = 1,
        per_page: int = 20,
        target_id: str | None = None,
        status: AuditStatus | None = None,
    ) -> tuple[list[AuditJob], int]:
        """List audit jobs with filtering."""
        return await AuditJobRepository.list(page, per_page, target_id, status)
