/**
 * NetNynja Enterprise - Authentication Errors
 */

export class AuthError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class TokenExpiredError extends AuthError {
  constructor(message = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401);
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message = 'Invalid token') {
    super(message, 'INVALID_TOKEN', 401);
    this.name = 'InvalidTokenError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message = 'Invalid credentials') {
    super(message, 'INVALID_CREDENTIALS', 401);
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountLockedError extends AuthError {
  constructor(message = 'Account is locked') {
    super(message, 'ACCOUNT_LOCKED', 403);
    this.name = 'AccountLockedError';
  }
}

export class InsufficientPermissionsError extends AuthError {
  constructor(requiredRole?: string) {
    const message = requiredRole
      ? `Insufficient permissions. Required role: ${requiredRole}`
      : 'Insufficient permissions';
    super(message, 'INSUFFICIENT_PERMISSIONS', 403);
    this.name = 'InsufficientPermissionsError';
  }
}
