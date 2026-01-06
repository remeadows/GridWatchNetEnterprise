/**
 * NetNynja Enterprise - Shared Authentication Library
 * JWT + Argon2id implementation
 */

import * as argon2 from 'argon2';
import * as jose from 'jose';
import type { JWTPayload, AuthTokens, UserRole } from '@netnynja/shared-types';

// ============================================
// Configuration
// ============================================

export interface AuthConfig {
  jwtSecret?: string;
  jwtPrivateKey?: string;
  jwtPublicKey?: string;
  accessTokenExpiry: string; // e.g., '15m'
  refreshTokenExpiry: string; // e.g., '7d'
  issuer: string;
  audience: string;
}

const DEFAULT_CONFIG: AuthConfig = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'netnynja-enterprise',
  audience: 'netnynja-api',
};

let config: AuthConfig = { ...DEFAULT_CONFIG };

export function configureAuth(newConfig: Partial<AuthConfig>): void {
  config = { ...config, ...newConfig };
}

// ============================================
// Password Hashing (Argon2id)
// ============================================

/**
 * Argon2id configuration following OWASP recommendations
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
} as const;

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
  });
}

/**
 * Verify a password against an Argon2id hash
 */
export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Check if a hash needs to be rehashed (e.g., after config changes)
 */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

// ============================================
// JWT Token Management
// ============================================

type SecretOrKey = Uint8Array | jose.KeyLike;

async function getSigningKey(): Promise<SecretOrKey> {
  if (config.jwtPrivateKey) {
    return jose.importPKCS8(config.jwtPrivateKey, 'RS256');
  }
  if (config.jwtSecret) {
    return new TextEncoder().encode(config.jwtSecret);
  }
  throw new Error('No JWT signing key configured');
}

async function getVerificationKey(): Promise<SecretOrKey> {
  if (config.jwtPublicKey) {
    return jose.importSPKI(config.jwtPublicKey, 'RS256');
  }
  if (config.jwtSecret) {
    return new TextEncoder().encode(config.jwtSecret);
  }
  throw new Error('No JWT verification key configured');
}

function getAlgorithm(): string {
  return config.jwtPrivateKey ? 'RS256' : 'HS256';
}

/**
 * Generate access and refresh tokens
 */
export async function generateTokens(
  userId: string,
  username: string,
  email: string,
  role: UserRole
): Promise<AuthTokens> {
  const key = await getSigningKey();
  const alg = getAlgorithm();

  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    username,
    email,
    role,
  };

  const accessToken = await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime(config.accessTokenExpiry)
    .sign(key);

  const refreshToken = await new jose.SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime(config.refreshTokenExpiry)
    .sign(key);

  // Parse expiry for response
  const expiresIn = parseExpiry(config.accessTokenExpiry);

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Verify and decode an access token
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const key = await getVerificationKey();

  const { payload } = await jose.jwtVerify(token, key, {
    issuer: config.issuer,
    audience: config.audience,
  });

  return {
    sub: payload.sub as string,
    username: payload.username as string,
    email: payload.email as string,
    role: payload.role as UserRole,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}

/**
 * Verify a refresh token
 */
export async function verifyRefreshToken(
  token: string
): Promise<{ sub: string }> {
  const key = await getVerificationKey();

  const { payload } = await jose.jwtVerify(token, key, {
    issuer: config.issuer,
    audience: config.audience,
  });

  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  return { sub: payload.sub as string };
}

/**
 * Decode a token without verification (for debugging)
 */
export function decodeToken(token: string): jose.JWTPayload | null {
  try {
    return jose.decodeJwt(token);
  } catch {
    return null;
  }
}

// ============================================
// Utilities
// ============================================

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) return 900; // default 15 minutes

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 900;
  }
}

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

/**
 * Hash a token for storage (for refresh token storage)
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// Exports
// ============================================

export { type JWTPayload, type AuthTokens, type UserRole };
export { AuthError, UnauthorizedError, ForbiddenError } from './errors';
