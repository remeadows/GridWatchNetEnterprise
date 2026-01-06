"""STIG API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ..core.auth import get_current_user, require_role, UserContext
from ..core.logging import get_logger
from ..db.repository import (
    TargetRepository,
    DefinitionRepository,
    AuditJobRepository,
    AuditResultRepository,
)
from ..models import (
    Target,
    TargetCreate,
    TargetUpdate,
    STIGDefinition,
    AuditJob,
    AuditJobCreate,
    AuditStatus,
    AuditResult,
    CheckStatus,
    ComplianceSummary,
    Pagination,
    PaginatedResponse,
    APIResponse,
    ReportFormat,
    ReportRequest,
)
from ..services import AuditService, ComplianceService

logger = get_logger(__name__)
router = APIRouter(prefix="/api/v1/stig", tags=["stig"])

# Service instances
audit_service = AuditService()
compliance_service = ComplianceService(audit_service)


# =============================================================================
# Target Endpoints
# =============================================================================


@router.get("/targets", response_model=PaginatedResponse[Target])
async def list_targets(
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    platform: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
) -> PaginatedResponse[Target]:
    """List STIG targets with pagination and filtering."""
    await get_current_user(request)

    targets, total = await TargetRepository.list(
        page=page,
        per_page=per_page,
        platform=platform,
        is_active=is_active,
        search=search,
    )

    total_pages = (total + per_page - 1) // per_page

    return PaginatedResponse(
        data=targets,
        pagination=Pagination(
            page=page,
            per_page=per_page,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.get("/targets/{target_id}", response_model=APIResponse[Target])
async def get_target(
    request: Request,
    target_id: str,
) -> APIResponse[Target]:
    """Get a specific target by ID."""
    await get_current_user(request)

    target = await TargetRepository.get_by_id(target_id)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target not found: {target_id}",
        )

    return APIResponse(data=target)


@router.post("/targets", response_model=APIResponse[Target], status_code=status.HTTP_201_CREATED)
@require_role("admin", "operator")
async def create_target(
    request: Request,
    data: TargetCreate,
    user: UserContext = None,
) -> APIResponse[Target]:
    """Create a new STIG target."""
    target = await TargetRepository.create(data)
    logger.info("target_created", target_id=target.id, user=user.username if user else None)
    return APIResponse(data=target)


@router.put("/targets/{target_id}", response_model=APIResponse[Target])
@require_role("admin", "operator")
async def update_target(
    request: Request,
    target_id: str,
    data: TargetUpdate,
    user: UserContext = None,
) -> APIResponse[Target]:
    """Update a STIG target."""
    target = await TargetRepository.update(target_id, data)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target not found: {target_id}",
        )

    logger.info("target_updated", target_id=target_id, user=user.username if user else None)
    return APIResponse(data=target)


@router.delete("/targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_role("admin")
async def delete_target(
    request: Request,
    target_id: str,
    user: UserContext = None,
) -> None:
    """Delete a STIG target."""
    deleted = await TargetRepository.delete(target_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target not found: {target_id}",
        )

    logger.info("target_deleted", target_id=target_id, user=user.username if user else None)


# =============================================================================
# Definition Endpoints
# =============================================================================


@router.get("/definitions", response_model=PaginatedResponse[STIGDefinition])
async def list_definitions(
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    platform: str | None = None,
    search: str | None = None,
) -> PaginatedResponse[STIGDefinition]:
    """List STIG definitions with pagination."""
    await get_current_user(request)

    definitions, total = await DefinitionRepository.list(
        page=page,
        per_page=per_page,
        platform=platform,
        search=search,
    )

    total_pages = (total + per_page - 1) // per_page

    return PaginatedResponse(
        data=definitions,
        pagination=Pagination(
            page=page,
            per_page=per_page,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.get("/definitions/{definition_id}", response_model=APIResponse[STIGDefinition])
async def get_definition(
    request: Request,
    definition_id: str,
) -> APIResponse[STIGDefinition]:
    """Get a specific STIG definition by ID."""
    await get_current_user(request)

    definition = await DefinitionRepository.get_by_id(definition_id)
    if not definition:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Definition not found: {definition_id}",
        )

    return APIResponse(data=definition)


# =============================================================================
# Audit Endpoints
# =============================================================================


@router.get("/audits", response_model=PaginatedResponse[AuditJob])
async def list_audits(
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    target_id: str | None = None,
    status_filter: AuditStatus | None = Query(None, alias="status"),
) -> PaginatedResponse[AuditJob]:
    """List audit jobs with pagination."""
    await get_current_user(request)

    jobs, total = await audit_service.list_jobs(
        page=page,
        per_page=per_page,
        target_id=target_id,
        status=status_filter,
    )

    total_pages = (total + per_page - 1) // per_page

    return PaginatedResponse(
        data=jobs,
        pagination=Pagination(
            page=page,
            per_page=per_page,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.post("/audits", response_model=APIResponse[AuditJob], status_code=status.HTTP_201_CREATED)
@require_role("admin", "operator")
async def start_audit(
    request: Request,
    data: AuditJobCreate,
    user: UserContext = None,
) -> APIResponse[AuditJob]:
    """Start a new STIG audit."""
    try:
        job = await audit_service.start_audit(
            target_id=data.target_id,
            definition_id=data.definition_id,
            name=data.name,
            created_by=user.id if user else None,
        )
        return APIResponse(data=job)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/audits/{job_id}", response_model=APIResponse[AuditJob])
async def get_audit(
    request: Request,
    job_id: str,
) -> APIResponse[AuditJob]:
    """Get a specific audit job by ID."""
    await get_current_user(request)

    job = await audit_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit job not found: {job_id}",
        )

    return APIResponse(data=job)


@router.post("/audits/{job_id}/cancel", response_model=APIResponse[AuditJob])
@require_role("admin", "operator")
async def cancel_audit(
    request: Request,
    job_id: str,
    user: UserContext = None,
) -> APIResponse[AuditJob]:
    """Cancel a running audit job."""
    cancelled = await audit_service.cancel_audit(job_id)
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel job (not found or not cancellable)",
        )

    job = await audit_service.get_job(job_id)
    logger.info("audit_cancelled", job_id=job_id, user=user.username if user else None)
    return APIResponse(data=job)


@router.get("/audits/{job_id}/results", response_model=PaginatedResponse[AuditResult])
async def get_audit_results(
    request: Request,
    job_id: str,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 50,
    status_filter: CheckStatus | None = Query(None, alias="status"),
    severity: str | None = None,
) -> PaginatedResponse[AuditResult]:
    """Get results for an audit job."""
    await get_current_user(request)

    results, total = await audit_service.get_job_results(
        job_id=job_id,
        page=page,
        per_page=per_page,
        status=status_filter,
        severity=severity,
    )

    total_pages = (total + per_page - 1) // per_page

    return PaginatedResponse(
        data=results,
        pagination=Pagination(
            page=page,
            per_page=per_page,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.get("/audits/{job_id}/summary", response_model=APIResponse[ComplianceSummary])
async def get_audit_summary(
    request: Request,
    job_id: str,
) -> APIResponse[ComplianceSummary]:
    """Get compliance summary for an audit job."""
    await get_current_user(request)

    summary = await audit_service.get_compliance_summary(job_id)
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit job not found: {job_id}",
        )

    return APIResponse(data=summary)


# =============================================================================
# Report Endpoints
# =============================================================================


@router.post("/reports/generate")
@require_role("admin", "operator")
async def generate_report(
    request: Request,
    data: ReportRequest,
    user: UserContext = None,
) -> APIResponse[dict]:
    """Generate a report for an audit job.

    Returns a download URL or job ID for async generation.
    """
    job = await audit_service.get_job(data.job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit job not found: {data.job_id}",
        )

    if job.status != AuditStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only generate reports for completed audits",
        )

    # For now, return a placeholder response
    # Full implementation would queue report generation
    logger.info(
        "report_requested",
        job_id=data.job_id,
        format=data.format.value,
        user=user.username if user else None,
    )

    return APIResponse(
        data={
            "status": "queued",
            "job_id": data.job_id,
            "format": data.format.value,
            "message": "Report generation has been queued",
        }
    )


# =============================================================================
# Dashboard/Compliance Endpoints
# =============================================================================


@router.get("/dashboard")
async def get_dashboard(
    request: Request,
) -> APIResponse[dict]:
    """Get STIG Manager dashboard data."""
    await get_current_user(request)

    dashboard = await compliance_service.get_dashboard()

    return APIResponse(data=dashboard.model_dump())


@router.get("/compliance/summary")
async def get_compliance_summary(
    request: Request,
) -> APIResponse[dict]:
    """Get overall compliance summary across all targets."""
    await get_current_user(request)

    summary = await compliance_service.get_compliance_summary_for_all_targets()

    return APIResponse(data=summary)
