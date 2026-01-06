"""Common models and response schemas."""

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Pagination(BaseModel):
    """Pagination metadata."""

    page: int = Field(ge=1)
    limit: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    pages: int = Field(ge=0)


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated API response."""

    success: bool = True
    data: list[T]
    pagination: Pagination


class APIResponse(BaseModel, Generic[T]):
    """Standard API response wrapper."""

    success: bool = True
    data: T
    message: str | None = None


class ErrorResponse(BaseModel):
    """Error response."""

    success: bool = False
    error: str
    code: str | None = None
    details: dict[str, Any] | None = None
