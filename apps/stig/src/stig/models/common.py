"""Common models used across STIG service."""

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Pagination(BaseModel):
    """Pagination information."""

    page: int = Field(ge=1, default=1)
    per_page: int = Field(ge=1, le=100, default=20)
    total: int = Field(ge=0, default=0)
    total_pages: int = Field(ge=0, default=0)


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response wrapper."""

    data: list[T]
    pagination: Pagination


class APIResponse(BaseModel, Generic[T]):
    """Standard API response wrapper."""

    success: bool = True
    data: T | None = None
    error: str | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class BaseEntity(BaseModel):
    """Base entity with common fields."""

    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
