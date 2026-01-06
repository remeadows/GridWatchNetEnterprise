"""Compliance analytics and dashboard service."""

from datetime import datetime, timedelta

from ..core.logging import get_logger
from ..db.repository import (
    TargetRepository,
    DefinitionRepository,
    AuditJobRepository,
    AuditResultRepository,
)
from ..models import (
    STIGDashboard,
    TargetCompliance,
    WorstFinding,
    ComplianceTrend,
    AuditStatus,
)
from .audit import AuditService

logger = get_logger(__name__)


class ComplianceService:
    """Service for compliance analytics and dashboard data."""

    def __init__(self, audit_service: AuditService | None = None) -> None:
        """Initialize compliance service."""
        self.audit_service = audit_service or AuditService()

    async def get_dashboard(self) -> STIGDashboard:
        """Get STIG Manager dashboard data.

        Returns:
            Dashboard with summary statistics and trends
        """
        # Get target counts
        targets, total_targets = await TargetRepository.list(per_page=1)
        active_targets_list, active_count = await TargetRepository.list(
            per_page=1, is_active=True
        )

        # Get definition count
        total_definitions = await DefinitionRepository.count()

        # Get recent audits
        recent_audits = await AuditJobRepository.get_recent(limit=10)

        # Get target compliance status
        targets_with_compliance = await self._get_target_compliance()

        # Get compliance trend (last 30 days)
        compliance_trend = await self._get_compliance_trend(days=30)

        # Get worst findings
        worst_findings = await self._get_worst_findings(limit=10)

        return STIGDashboard(
            total_targets=total_targets,
            active_targets=active_count,
            total_definitions=total_definitions,
            recent_audits=recent_audits,
            compliance_trend=compliance_trend,
            worst_findings=worst_findings,
            target_compliance=targets_with_compliance,
        )

    async def _get_target_compliance(self) -> list[TargetCompliance]:
        """Get compliance status for all active targets."""
        targets, _ = await TargetRepository.list(per_page=100, is_active=True)

        result = []
        for target in targets:
            # Get latest completed audit for this target
            jobs, _ = await AuditJobRepository.list(
                per_page=1, target_id=target.id, status=AuditStatus.COMPLETED
            )

            last_score = None
            last_audit = None

            if jobs:
                latest_job = jobs[0]
                summary = await self.audit_service.get_compliance_summary(latest_job.id)
                if summary:
                    last_score = summary.compliance_score
                    last_audit = summary.audit_date

            result.append(
                TargetCompliance(
                    target=target,
                    last_score=last_score,
                    last_audit=last_audit,
                )
            )

        return result

    async def _get_compliance_trend(self, days: int = 30) -> list[ComplianceTrend]:
        """Get compliance score trend over time."""
        from ..db.connection import get_pool

        pool = get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                WITH daily_scores AS (
                    SELECT
                        DATE_TRUNC('day', aj.completed_at) as audit_day,
                        COUNT(CASE WHEN ar.status = 'pass' THEN 1 END)::float /
                            NULLIF(COUNT(CASE WHEN ar.status IN ('pass', 'fail') THEN 1 END), 0) * 100 as score
                    FROM stig.audit_jobs aj
                    JOIN stig.audit_results ar ON ar.job_id = aj.id
                    WHERE aj.status = 'completed'
                        AND aj.completed_at >= NOW() - INTERVAL '%s days'
                    GROUP BY DATE_TRUNC('day', aj.completed_at)
                    ORDER BY audit_day ASC
                )
                SELECT audit_day, COALESCE(score, 0) as score
                FROM daily_scores
                """,
                days,
            )

        return [
            ComplianceTrend(date=row["audit_day"], score=round(row["score"], 2))
            for row in rows
        ]

    async def _get_worst_findings(self, limit: int = 10) -> list[WorstFinding]:
        """Get findings that affect the most targets."""
        from ..db.connection import get_pool

        pool = get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    ar.rule_id,
                    ar.title,
                    ar.severity,
                    COUNT(DISTINCT aj.target_id) as affected_targets
                FROM stig.audit_results ar
                JOIN stig.audit_jobs aj ON aj.id = ar.job_id
                WHERE ar.status = 'fail'
                    AND aj.status = 'completed'
                    AND aj.id IN (
                        -- Get latest completed job per target
                        SELECT DISTINCT ON (target_id) id
                        FROM stig.audit_jobs
                        WHERE status = 'completed'
                        ORDER BY target_id, completed_at DESC
                    )
                GROUP BY ar.rule_id, ar.title, ar.severity
                ORDER BY
                    CASE ar.severity
                        WHEN 'high' THEN 1
                        WHEN 'medium' THEN 2
                        WHEN 'low' THEN 3
                        ELSE 4
                    END,
                    affected_targets DESC
                LIMIT $1
                """,
                limit,
            )

        return [
            WorstFinding(
                rule_id=row["rule_id"],
                title=row["title"] or "",
                severity=row["severity"] or "medium",
                affected_targets=row["affected_targets"],
            )
            for row in rows
        ]

    async def get_compliance_summary_for_all_targets(self) -> dict[str, float]:
        """Get aggregated compliance summary across all targets.

        Returns:
            Dictionary with overall statistics
        """
        from ..db.connection import get_pool

        pool = get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                WITH latest_jobs AS (
                    SELECT DISTINCT ON (target_id) id, target_id
                    FROM stig.audit_jobs
                    WHERE status = 'completed'
                    ORDER BY target_id, completed_at DESC
                )
                SELECT
                    COUNT(*) as total_checks,
                    COUNT(CASE WHEN ar.status = 'pass' THEN 1 END) as passed,
                    COUNT(CASE WHEN ar.status = 'fail' THEN 1 END) as failed,
                    COUNT(CASE WHEN ar.severity = 'high' AND ar.status = 'fail' THEN 1 END) as high_failed,
                    COUNT(CASE WHEN ar.severity = 'medium' AND ar.status = 'fail' THEN 1 END) as medium_failed,
                    COUNT(CASE WHEN ar.severity = 'low' AND ar.status = 'fail' THEN 1 END) as low_failed,
                    (SELECT COUNT(*) FROM stig.targets WHERE is_active = true) as total_targets
                FROM stig.audit_results ar
                JOIN latest_jobs lj ON lj.id = ar.job_id
                """
            )

        if not row or row["total_checks"] == 0:
            return {
                "total_checks": 0,
                "passed": 0,
                "failed": 0,
                "compliance_score": 0.0,
                "high_failed": 0,
                "medium_failed": 0,
                "low_failed": 0,
                "total_targets": 0,
            }

        applicable = row["passed"] + row["failed"]
        score = (row["passed"] / applicable * 100) if applicable > 0 else 0.0

        return {
            "total_checks": row["total_checks"],
            "passed": row["passed"],
            "failed": row["failed"],
            "compliance_score": round(score, 2),
            "high_failed": row["high_failed"],
            "medium_failed": row["medium_failed"],
            "low_failed": row["low_failed"],
            "total_targets": row["total_targets"],
        }
