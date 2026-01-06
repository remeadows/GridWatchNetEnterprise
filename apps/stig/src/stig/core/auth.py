"""JWT authentication and authorization for STIG service."""

from dataclasses import dataclass
from functools import wraps
from typing import Any, Callable, Literal

from fastapi import HTTPException, Request, status
from jose import JWTError, jwt

from .config import settings
from .logging import get_logger

logger = get_logger(__name__)

Role = Literal["admin", "operator", "viewer"]


@dataclass
class UserContext:
    """Authenticated user context."""

    id: str
    username: str
    email: str
    role: Role


def verify_token(token: str) -> UserContext:
    """Verify JWT token and extract user context.

    Args:
        token: JWT access token

    Returns:
        UserContext with user information

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )

        user_id = payload.get("sub")
        username = payload.get("username")
        email = payload.get("email")
        role = payload.get("role", "viewer")

        if not user_id or not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )

        return UserContext(
            id=user_id,
            username=username,
            email=email or "",
            role=role,
        )

    except JWTError as e:
        logger.warning("jwt_verification_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(request: Request) -> UserContext:
    """Extract and verify user from request Authorization header.

    Args:
        request: FastAPI request object

    Returns:
        UserContext with authenticated user

    Raises:
        HTTPException: If no token or invalid token
    """
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header.split(" ")[1]
    return verify_token(token)


def require_role(*allowed_roles: Role) -> Callable:
    """Decorator to require specific roles for an endpoint.

    Args:
        *allowed_roles: Roles that are allowed to access the endpoint

    Returns:
        Decorator function
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            request = kwargs.get("request")
            if not request:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if not request:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Request object not found",
                )

            user = await get_current_user(request)

            if user.role not in allowed_roles:
                logger.warning(
                    "access_denied",
                    user_id=user.id,
                    role=user.role,
                    required_roles=allowed_roles,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Requires role: {', '.join(allowed_roles)}",
                )

            kwargs["user"] = user
            return await func(*args, **kwargs)

        return wrapper

    return decorator
