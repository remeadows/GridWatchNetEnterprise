"""JWT authentication utilities."""

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .config import settings
from .logging import get_logger

logger = get_logger(__name__)

security = HTTPBearer(auto_error=False)


class JWTPayload:
    """Parsed JWT token payload."""

    def __init__(self, payload: dict[str, Any]) -> None:
        self.sub: str = payload.get("sub", "")
        self.username: str = payload.get("username", "")
        self.email: str = payload.get("email", "")
        self.role: str = payload.get("role", "viewer")
        self.iat: int = payload.get("iat", 0)
        self.exp: int = payload.get("exp", 0)

    @property
    def is_admin(self) -> bool:
        """Check if user has admin role."""
        return self.role == "admin"

    @property
    def is_operator(self) -> bool:
        """Check if user has operator or higher role."""
        return self.role in ("admin", "operator")


def verify_token(token: str) -> JWTPayload:
    """Verify and decode JWT token."""
    try:
        # Determine which key/algorithm to use
        if settings.jwt_public_key:
            key = settings.jwt_public_key
            algorithms = ["RS256"]
        elif settings.jwt_secret:
            key = settings.jwt_secret
            algorithms = ["HS256"]
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="JWT configuration missing",
            )

        payload = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience="netnynja-api",
            issuer="netnynja-enterprise",
        )

        # Check expiration
        exp = payload.get("exp", 0)
        if datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )

        return JWTPayload(payload)

    except JWTError as e:
        logger.warning("jwt_verification_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from e


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> JWTPayload:
    """Extract and verify current user from request."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return verify_token(credentials.credentials)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> JWTPayload | None:
    """Extract current user if present, otherwise return None."""
    if credentials is None:
        return None

    try:
        return verify_token(credentials.credentials)
    except HTTPException:
        return None


def require_role(*allowed_roles: str):
    """Dependency factory for role-based access control."""

    async def role_checker(user: JWTPayload = Depends(get_current_user)) -> JWTPayload:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}",
            )
        return user

    return role_checker


# Common role dependencies
require_admin = require_role("admin")
require_operator = require_role("admin", "operator")
require_viewer = require_role("admin", "operator", "viewer")
