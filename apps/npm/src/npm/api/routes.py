"""NPM API routes."""

from datetime import datetime, timezone, timedelta
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..core.auth import JWTPayload, get_current_user, require_operator, require_admin
from ..services.device import DeviceService
from ..services.metrics import MetricsService
from ..db import get_db, AlertRepository, AlertRuleRepository
from ..models.device import Device, DeviceCreate, DeviceUpdate, DeviceWithInterfaces, DeviceStatus
from ..models.interface import Interface, InterfaceUpdate
from ..models.alert import (
    Alert, AlertCreate, AlertUpdate, AlertStatus, AlertSeverity,
    AlertRule, AlertRuleCreate, AlertRuleUpdate, AlertWithContext
)
from ..models.metrics import DashboardData, DashboardStats, MetricSeries
from ..models.common import PaginatedResponse, APIResponse, Pagination

router = APIRouter(prefix="/api/v1/npm", tags=["NPM"])

# Service instances
device_service = DeviceService()
metrics_service = MetricsService()


# ============================================
# Device endpoints
# ============================================

@router.get("/devices", response_model=PaginatedResponse[Device])
async def list_devices(
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    search: str | None = None,
    status: DeviceStatus | None = None,
    is_active: bool | None = None,
    _user: JWTPayload = Depends(get_current_user),
) -> PaginatedResponse[Device]:
    """List all devices with pagination and optional filters."""
    return await device_service.list_devices(
        page=page, limit=limit, search=search, status=status, is_active=is_active
    )


@router.get("/devices/{device_id}", response_model=APIResponse[DeviceWithInterfaces])
async def get_device(
    device_id: str,
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[DeviceWithInterfaces]:
    """Get a device by ID with interfaces and alert count."""
    device = await device_service.get_device_with_interfaces(device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device {device_id} not found",
        )
    return APIResponse(data=device)


@router.post("/devices", response_model=APIResponse[Device], status_code=status.HTTP_201_CREATED)
async def create_device(
    data: DeviceCreate,
    _user: JWTPayload = Depends(require_operator),
) -> APIResponse[Device]:
    """Create a new device (requires operator role)."""
    try:
        device = await device_service.create_device(data)
        return APIResponse(data=device, message="Device created successfully")
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/devices/{device_id}", response_model=APIResponse[Device])
async def update_device(
    device_id: str,
    data: DeviceUpdate,
    _user: JWTPayload = Depends(require_operator),
) -> APIResponse[Device]:
    """Update an existing device (requires operator role)."""
    try:
        device = await device_service.update_device(device_id, data)
        if not device:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Device {device_id} not found",
            )
        return APIResponse(data=device, message="Device updated successfully")
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: str,
    _user: JWTPayload = Depends(require_admin),
) -> None:
    """Delete a device (requires admin role)."""
    deleted = await device_service.delete_device(device_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device {device_id} not found",
        )


# ============================================
# Interface endpoints
# ============================================

@router.get("/devices/{device_id}/interfaces", response_model=APIResponse[list[Interface]])
async def get_device_interfaces(
    device_id: str,
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[list[Interface]]:
    """Get all interfaces for a device."""
    interfaces = await device_service.get_device_interfaces(device_id)
    return APIResponse(data=interfaces)


@router.put("/interfaces/{interface_id}", response_model=APIResponse[Interface])
async def update_interface(
    interface_id: str,
    data: InterfaceUpdate,
    _user: JWTPayload = Depends(require_operator),
) -> APIResponse[Interface]:
    """Update an interface (requires operator role)."""
    interface = await device_service.update_interface(interface_id, data)
    if not interface:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interface {interface_id} not found",
        )
    return APIResponse(data=interface, message="Interface updated successfully")


# ============================================
# Metrics endpoints
# ============================================

@router.get("/devices/{device_id}/metrics", response_model=APIResponse[dict[str, MetricSeries]])
async def get_device_metrics(
    device_id: str,
    hours: Annotated[int, Query(ge=1, le=168)] = 1,
    step: str = "1m",
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[dict[str, MetricSeries]]:
    """Get metrics for a device over the specified time range."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    metrics = await metrics_service.get_device_metrics(device_id, start, end, step)
    return APIResponse(data=metrics)


@router.get("/interfaces/{interface_id}/metrics", response_model=APIResponse[dict[str, MetricSeries]])
async def get_interface_metrics(
    interface_id: str,
    hours: Annotated[int, Query(ge=1, le=168)] = 1,
    step: str = "1m",
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[dict[str, MetricSeries]]:
    """Get metrics for an interface over the specified time range."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    metrics = await metrics_service.get_interface_metrics(interface_id, start, end, step)
    return APIResponse(data=metrics)


# ============================================
# Alert endpoints
# ============================================

@router.get("/alerts", response_model=PaginatedResponse[Alert])
async def list_alerts(
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    status: AlertStatus | None = None,
    severity: AlertSeverity | None = None,
    device_id: str | None = None,
    _user: JWTPayload = Depends(get_current_user),
) -> PaginatedResponse[Alert]:
    """List all alerts with pagination and optional filters."""
    async with get_db() as conn:
        repo = AlertRepository(conn)
        alerts, total = await repo.find_all(
            page=page,
            limit=limit,
            status=status,
            severity=severity.value if severity else None,
            device_id=device_id,
        )

        return PaginatedResponse(
            data=alerts,
            pagination=Pagination(
                page=page,
                limit=limit,
                total=total,
                pages=ceil(total / limit) if total > 0 else 0,
            ),
        )


@router.get("/alerts/{alert_id}", response_model=APIResponse[Alert])
async def get_alert(
    alert_id: str,
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[Alert]:
    """Get an alert by ID."""
    async with get_db() as conn:
        repo = AlertRepository(conn)
        alert = await repo.find_by_id(alert_id)
        if not alert:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Alert {alert_id} not found",
            )
        return APIResponse(data=alert)


@router.post("/alerts/{alert_id}/acknowledge", response_model=APIResponse[Alert])
async def acknowledge_alert(
    alert_id: str,
    user: JWTPayload = Depends(require_operator),
) -> APIResponse[Alert]:
    """Acknowledge an alert (requires operator role)."""
    alert = await device_service.acknowledge_alert(alert_id, user.sub)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found",
        )
    return APIResponse(data=alert, message="Alert acknowledged")


@router.post("/alerts/{alert_id}/resolve", response_model=APIResponse[Alert])
async def resolve_alert(
    alert_id: str,
    _user: JWTPayload = Depends(require_operator),
) -> APIResponse[Alert]:
    """Resolve an alert (requires operator role)."""
    alert = await device_service.resolve_alert(alert_id)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found",
        )
    return APIResponse(data=alert, message="Alert resolved")


# ============================================
# Alert Rule endpoints
# ============================================

@router.get("/alert-rules", response_model=APIResponse[list[AlertRule]])
async def list_alert_rules(
    is_active: bool | None = None,
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[list[AlertRule]]:
    """List all alert rules."""
    async with get_db() as conn:
        repo = AlertRuleRepository(conn)
        rules = await repo.find_all(is_active=is_active)
        return APIResponse(data=rules)


@router.get("/alert-rules/{rule_id}", response_model=APIResponse[AlertRule])
async def get_alert_rule(
    rule_id: str,
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[AlertRule]:
    """Get an alert rule by ID."""
    async with get_db() as conn:
        repo = AlertRuleRepository(conn)
        rule = await repo.find_by_id(rule_id)
        if not rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Alert rule {rule_id} not found",
            )
        return APIResponse(data=rule)


@router.post("/alert-rules", response_model=APIResponse[AlertRule], status_code=status.HTTP_201_CREATED)
async def create_alert_rule(
    data: AlertRuleCreate,
    user: JWTPayload = Depends(require_operator),
) -> APIResponse[AlertRule]:
    """Create a new alert rule (requires operator role)."""
    async with get_db() as conn:
        repo = AlertRuleRepository(conn)
        rule = await repo.create(data, created_by=user.sub)
        return APIResponse(data=rule, message="Alert rule created successfully")


@router.put("/alert-rules/{rule_id}", response_model=APIResponse[AlertRule])
async def update_alert_rule(
    rule_id: str,
    data: AlertRuleUpdate,
    _user: JWTPayload = Depends(require_operator),
) -> APIResponse[AlertRule]:
    """Update an existing alert rule (requires operator role)."""
    async with get_db() as conn:
        repo = AlertRuleRepository(conn)
        rule = await repo.update(rule_id, data)
        if not rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Alert rule {rule_id} not found",
            )
        return APIResponse(data=rule, message="Alert rule updated successfully")


@router.delete("/alert-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(
    rule_id: str,
    _user: JWTPayload = Depends(require_admin),
) -> None:
    """Delete an alert rule (requires admin role)."""
    async with get_db() as conn:
        repo = AlertRuleRepository(conn)
        deleted = await repo.delete(rule_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Alert rule {rule_id} not found",
            )


# ============================================
# Dashboard endpoints
# ============================================

@router.get("/dashboard", response_model=APIResponse[DashboardData])
async def get_dashboard(
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[DashboardData]:
    """Get NPM dashboard data."""
    data = await metrics_service.get_dashboard_data()
    return APIResponse(data=data)


@router.get("/dashboard/stats", response_model=APIResponse[DashboardStats])
async def get_dashboard_stats(
    _user: JWTPayload = Depends(get_current_user),
) -> APIResponse[DashboardStats]:
    """Get NPM dashboard statistics."""
    stats = await metrics_service.get_dashboard_stats()
    return APIResponse(data=stats)
