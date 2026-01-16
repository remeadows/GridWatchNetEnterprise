"""STIG API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form, status

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
    Platform,
)
from ..services import AuditService, ComplianceService, config_checker
from ..collectors.config_analyzer import detect_platform_from_content
from ..library import (
    STIGCatalog,
    STIGLibraryIndexer,
    get_library_indexer,
    initialize_library,
)

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


# =============================================================================
# Configuration File Analysis Endpoints
# =============================================================================


@router.post("/targets/{target_id}/analyze-config", response_model=APIResponse[dict])
@require_role("admin", "operator")
async def analyze_target_config(
    request: Request,
    target_id: str,
    definition_id: Annotated[str, Form()],
    config_file: UploadFile = File(...),
    user: UserContext = None,
) -> APIResponse[dict]:
    """Analyze a configuration file against a STIG for a target.

    Upload a device configuration file (.txt or .xml) to check compliance
    against the specified STIG definition. This creates an audit job and
    returns the results.

    Args:
        target_id: ID of the target asset
        definition_id: ID of the STIG definition to check against
        config_file: The configuration file to analyze

    Returns:
        Audit job with compliance results
    """
    # Verify target exists
    target = await TargetRepository.get_by_id(target_id)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target not found: {target_id}",
        )

    # Verify definition exists
    definition = await DefinitionRepository.get_by_id(definition_id)
    if not definition:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Definition not found: {definition_id}",
        )

    # Read configuration file
    try:
        content = await config_file.read()
        config_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configuration file must be UTF-8 encoded text",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read configuration file: {str(e)}",
        )

    # Validate file extension
    filename = config_file.filename or ""
    valid_extensions = [".txt", ".xml", ".conf", ".cfg"]
    if not any(filename.lower().endswith(ext) for ext in valid_extensions):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Supported: {', '.join(valid_extensions)}",
        )

    # Create audit job
    job_data = AuditJobCreate(
        name=f"Config Analysis: {target.name} - {filename}",
        target_id=target_id,
        definition_id=definition_id,
    )
    job = await AuditJobRepository.create(job_data, user.id if user else None)

    try:
        # Update job status
        await AuditJobRepository.update_status(job.id, AuditStatus.RUNNING)

        # Analyze configuration
        results = await config_checker.analyze_config(
            content=config_content,
            platform=target.platform,
            definition=definition,
            job_id=job.id,
        )

        # Save results
        if results:
            await AuditResultRepository.bulk_create(results)

        # Update target last audit
        await TargetRepository.update_last_audit(target.id)

        # Complete job
        await AuditJobRepository.update_status(job.id, AuditStatus.COMPLETED)

        # Get summary
        summary = await audit_service.get_compliance_summary(job.id)

        logger.info(
            "config_analysis_completed",
            target_id=target_id,
            job_id=job.id,
            total_checks=len(results),
            user=user.username if user else None,
        )

        return APIResponse(
            data={
                "job_id": job.id,
                "target_id": target_id,
                "definition_id": definition_id,
                "filename": filename,
                "total_checks": len(results),
                "summary": summary.model_dump() if summary else None,
            }
        )

    except Exception as e:
        logger.error("config_analysis_failed", job_id=job.id, error=str(e))
        await AuditJobRepository.update_status(job.id, AuditStatus.FAILED, str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Configuration analysis failed: {str(e)}",
        )


@router.post("/analyze-config", response_model=APIResponse[dict])
@require_role("admin", "operator")
async def analyze_config_standalone(
    request: Request,
    config_file: UploadFile = File(...),
    platform: Annotated[str | None, Form()] = None,
    user: UserContext = None,
) -> APIResponse[dict]:
    """Analyze a configuration file without a pre-existing target.

    Upload a device configuration file to check compliance. The platform
    can be auto-detected or specified explicitly.

    Args:
        config_file: The configuration file to analyze
        platform: Optional platform (auto-detected if not specified)

    Returns:
        Compliance analysis results
    """
    # Read configuration file
    try:
        content = await config_file.read()
        config_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configuration file must be UTF-8 encoded text",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read configuration file: {str(e)}",
        )

    # Determine platform
    detected_platform: Platform | None = None
    if platform:
        try:
            detected_platform = Platform(platform)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid platform: {platform}. Valid options: {[p.value for p in Platform]}",
            )
    else:
        detected_platform = detect_platform_from_content(config_content)
        if not detected_platform:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not auto-detect platform. Please specify the platform parameter.",
            )

    # Analyze configuration
    results = await config_checker.analyze_config(
        content=config_content,
        platform=detected_platform,
        definition=None,
        job_id="standalone",
    )

    # Calculate summary
    total = len(results)
    passed = sum(1 for r in results if r.status == CheckStatus.PASS)
    failed = sum(1 for r in results if r.status == CheckStatus.FAIL)
    not_reviewed = sum(1 for r in results if r.status == CheckStatus.NOT_REVIEWED)
    errors = sum(1 for r in results if r.status == CheckStatus.ERROR)

    compliance_score = (passed / (passed + failed) * 100) if (passed + failed) > 0 else 0

    logger.info(
        "standalone_config_analysis_completed",
        platform=detected_platform.value,
        total_checks=total,
        user=user.username if user else None,
    )

    return APIResponse(
        data={
            "platform": detected_platform.value,
            "filename": config_file.filename,
            "total_checks": total,
            "passed": passed,
            "failed": failed,
            "not_reviewed": not_reviewed,
            "errors": errors,
            "compliance_score": round(compliance_score, 2),
            "results": [
                {
                    "rule_id": r.rule_id,
                    "title": r.title,
                    "severity": r.severity.value,
                    "status": r.status.value,
                    "finding_details": r.finding_details,
                }
                for r in results
            ],
        }
    )


# =============================================================================
# STIG Library Endpoints
# =============================================================================


@router.get("/library")
async def get_library_catalog(
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 50,
    platform: str | None = None,
    stig_type: str | None = None,
    search: str | None = None,
) -> APIResponse[dict]:
    """Get STIG Library catalog with pagination and filtering.

    Browse the available STIG definitions in the library. Filter by platform,
    type (stig/srg), or search by title/ID.

    Args:
        page: Page number (starts at 1)
        per_page: Items per page (max 100)
        platform: Filter by platform (e.g., "arista_eos", "cisco_ios")
        stig_type: Filter by type ("stig" or "srg")
        search: Search term for title or benchmark ID

    Returns:
        Paginated list of STIG entries from the library
    """
    await get_current_user(request)

    indexer = get_library_indexer()
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STIG Library not initialized. Configure STIG_LIBRARY_PATH.",
        )

    # Build filter
    from ..library.catalog import STIGType

    platform_filter = None
    if platform:
        try:
            platform_filter = Platform(platform)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid platform: {platform}",
            )

    type_filter = None
    if stig_type:
        try:
            type_filter = STIGType(stig_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stig_type: {stig_type}. Valid: stig, srg",
            )

    # Search catalog
    entries = indexer.catalog.search(
        query=search or "",
        platform=platform_filter,
        stig_type=type_filter,
    )

    # Sort by title
    entries.sort(key=lambda e: e.title)

    # Paginate
    total = len(entries)
    start = (page - 1) * per_page
    end = start + per_page
    paginated_entries = entries[start:end]

    return APIResponse(
        data={
            "entries": [e.to_dict() for e in paginated_entries],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": (total + per_page - 1) // per_page,
            },
        }
    )


@router.get("/library/summary")
async def get_library_summary(
    request: Request,
) -> APIResponse[dict]:
    """Get STIG Library summary statistics.

    Returns:
        Library summary with counts by platform and type
    """
    await get_current_user(request)

    indexer = get_library_indexer()
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STIG Library not initialized. Configure STIG_LIBRARY_PATH.",
        )

    summary = indexer.summary()
    return APIResponse(data=summary)


@router.get("/library/platforms/{platform_value}")
async def get_stigs_for_platform(
    request: Request,
    platform_value: str,
) -> APIResponse[dict]:
    """Get all STIGs applicable to a specific platform.

    Args:
        platform_value: Platform identifier (e.g., "arista_eos", "cisco_ios")

    Returns:
        List of applicable STIG entries
    """
    await get_current_user(request)

    indexer = get_library_indexer()
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STIG Library not initialized.",
        )

    try:
        platform = Platform(platform_value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid platform: {platform_value}. Valid: {[p.value for p in Platform]}",
        )

    entries = indexer.catalog.get_by_platform(platform)

    # Also get the latest/recommended one
    latest = indexer.catalog.get_latest_for_platform(platform)

    return APIResponse(
        data={
            "platform": platform_value,
            "entries": [e.to_dict() for e in entries],
            "recommended": latest.to_dict() if latest else None,
            "total": len(entries),
        }
    )


@router.get("/library/{benchmark_id}")
async def get_library_entry(
    request: Request,
    benchmark_id: str,
) -> APIResponse[dict]:
    """Get a specific STIG entry from the library.

    Args:
        benchmark_id: STIG benchmark ID (e.g., "RHEL_9_STIG")

    Returns:
        STIG entry details
    """
    await get_current_user(request)

    indexer = get_library_indexer()
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STIG Library not initialized.",
        )

    entry = indexer.catalog.get_entry(benchmark_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"STIG not found: {benchmark_id}",
        )

    return APIResponse(data=entry.to_dict())


@router.get("/library/{benchmark_id}/rules")
async def get_library_rules(
    request: Request,
    benchmark_id: str,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=200)] = 50,
    severity: str | None = None,
    search: str | None = None,
) -> APIResponse[dict]:
    """Get rules for a specific STIG from the library.

    This loads the full XCCDF content on demand. Supports pagination
    and filtering by severity or search term.

    Args:
        benchmark_id: STIG benchmark ID
        page: Page number
        per_page: Rules per page
        severity: Filter by severity (high, medium, low)
        search: Search term for rule title/ID

    Returns:
        Paginated list of STIG rules
    """
    await get_current_user(request)

    indexer = get_library_indexer()
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STIG Library not initialized.",
        )

    entry = indexer.catalog.get_entry(benchmark_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"STIG not found: {benchmark_id}",
        )

    # Load rules (cached if previously loaded)
    rules = indexer.get_rules(benchmark_id)

    # Filter by severity
    if severity:
        rules = [r for r in rules if r.severity == severity.lower()]

    # Filter by search
    if search:
        search_lower = search.lower()
        rules = [
            r
            for r in rules
            if search_lower in r.title.lower()
            or search_lower in r.vuln_id.lower()
            or search_lower in r.rule_id.lower()
        ]

    # Paginate
    total = len(rules)
    start = (page - 1) * per_page
    end = start + per_page
    paginated_rules = rules[start:end]

    return APIResponse(
        data={
            "benchmark_id": benchmark_id,
            "rules": [r.to_dict() for r in paginated_rules],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": (total + per_page - 1) // per_page,
            },
        }
    )


@router.post("/library/rescan")
@require_role("admin")
async def rescan_library(
    request: Request,
    user: UserContext = None,
) -> APIResponse[dict]:
    """Rescan the STIG Library folder and rebuild the index.

    Admin only. Use this after adding new STIG ZIP files to the library folder.

    Returns:
        Scan statistics
    """
    indexer = get_library_indexer()
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STIG Library not initialized. Configure STIG_LIBRARY_PATH.",
        )

    logger.info("library_rescan_started", user=user.username if user else None)

    # Force rescan
    indexer.get_or_scan(force_rescan=True)

    summary = indexer.summary()

    logger.info(
        "library_rescan_completed",
        total_entries=summary["total_entries"],
        user=user.username if user else None,
    )

    return APIResponse(
        data={
            "status": "completed",
            "summary": summary,
        }
    )
