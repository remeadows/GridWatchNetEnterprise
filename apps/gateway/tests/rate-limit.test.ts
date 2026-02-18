/**
 * GridWatch NetEnterprise - Rate Limit Plugin Unit Tests
 */

describe("Rate Limit Functions", () => {
  // Extracted logic from rate-limit.ts for testing
  const SKIP_PATHS = ["/healthz", "/livez", "/readyz", "/docs", "/docs/"];
  const AUTH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/register"];
  const ROLE_MULTIPLIERS: Record<string, number> = {
    admin: 3,
    operator: 2,
    viewer: 1,
  };
  const DEFAULT_RATE_LIMIT = 100;

  function getRateLimitForRole(role?: string): number {
    const multiplier = role ? (ROLE_MULTIPLIERS[role] ?? 1) : 1;
    return DEFAULT_RATE_LIMIT * multiplier;
  }

  function shouldSkipRateLimit(path: string): boolean {
    return SKIP_PATHS.some((skip) => path === skip || path.startsWith(skip));
  }

  function isAuthPath(path: string): boolean {
    return AUTH_PATHS.some((authPath) => path === authPath);
  }

  describe("getRateLimitForRole", () => {
    it("should return 3x limit for admin role", () => {
      expect(getRateLimitForRole("admin")).toBe(300);
    });

    it("should return 2x limit for operator role", () => {
      expect(getRateLimitForRole("operator")).toBe(200);
    });

    it("should return 1x limit for viewer role", () => {
      expect(getRateLimitForRole("viewer")).toBe(100);
    });

    it("should return 1x limit for unknown role", () => {
      expect(getRateLimitForRole("unknown")).toBe(100);
    });

    it("should return 1x limit when role is undefined", () => {
      expect(getRateLimitForRole(undefined)).toBe(100);
    });

    it("should return 1x limit when role is empty string", () => {
      expect(getRateLimitForRole("")).toBe(100);
    });
  });

  describe("shouldSkipRateLimit", () => {
    describe("Health check endpoints", () => {
      it("should skip /healthz", () => {
        expect(shouldSkipRateLimit("/healthz")).toBe(true);
      });

      it("should skip /livez", () => {
        expect(shouldSkipRateLimit("/livez")).toBe(true);
      });

      it("should skip /readyz", () => {
        expect(shouldSkipRateLimit("/readyz")).toBe(true);
      });
    });

    describe("Documentation endpoints", () => {
      it("should skip /docs", () => {
        expect(shouldSkipRateLimit("/docs")).toBe(true);
      });

      it("should skip /docs/", () => {
        expect(shouldSkipRateLimit("/docs/")).toBe(true);
      });

      it("should skip /docs/json (starts with /docs)", () => {
        expect(shouldSkipRateLimit("/docs/json")).toBe(true);
      });
    });

    describe("Regular endpoints", () => {
      it("should not skip /api/v1/ipam/networks", () => {
        expect(shouldSkipRateLimit("/api/v1/ipam/networks")).toBe(false);
      });

      it("should not skip /api/v1/auth/login", () => {
        expect(shouldSkipRateLimit("/api/v1/auth/login")).toBe(false);
      });

      it("should not skip /metrics", () => {
        expect(shouldSkipRateLimit("/metrics")).toBe(false);
      });

      it("should not skip /", () => {
        expect(shouldSkipRateLimit("/")).toBe(false);
      });
    });
  });

  describe("isAuthPath", () => {
    describe("Auth endpoints", () => {
      it("should identify /api/v1/auth/login as auth path", () => {
        expect(isAuthPath("/api/v1/auth/login")).toBe(true);
      });

      it("should identify /api/v1/auth/register as auth path", () => {
        expect(isAuthPath("/api/v1/auth/register")).toBe(true);
      });
    });

    describe("Non-auth endpoints", () => {
      it("should not identify /api/v1/auth/logout as auth path", () => {
        expect(isAuthPath("/api/v1/auth/logout")).toBe(false);
      });

      it("should not identify /api/v1/auth/me as auth path", () => {
        expect(isAuthPath("/api/v1/auth/me")).toBe(false);
      });

      it("should not identify /api/v1/auth/refresh as auth path", () => {
        expect(isAuthPath("/api/v1/auth/refresh")).toBe(false);
      });

      it("should not identify /api/v1/ipam/networks as auth path", () => {
        expect(isAuthPath("/api/v1/ipam/networks")).toBe(false);
      });

      it("should not be case-insensitive", () => {
        expect(isAuthPath("/API/V1/AUTH/LOGIN")).toBe(false);
      });
    });
  });

  describe("Role-based rate limiting scenarios", () => {
    function simulateRateLimit(user: { role?: string } | null, path: string) {
      // Skip for health/docs
      if (shouldSkipRateLimit(path)) {
        return Infinity; // No limit
      }

      // Stricter for auth endpoints
      if (isAuthPath(path)) {
        return 10; // AUTH_MAX
      }

      // Role-based for authenticated users
      if (user) {
        return getRateLimitForRole(user.role);
      }

      // Default for unauthenticated
      return DEFAULT_RATE_LIMIT;
    }

    it("should apply stricter limit for login attempt", () => {
      const limit = simulateRateLimit(null, "/api/v1/auth/login");
      expect(limit).toBe(10);
    });

    it("should apply admin multiplier for admin user on regular endpoint", () => {
      const limit = simulateRateLimit(
        { role: "admin" },
        "/api/v1/ipam/networks",
      );
      expect(limit).toBe(300);
    });

    it("should apply operator multiplier for operator user", () => {
      const limit = simulateRateLimit(
        { role: "operator" },
        "/api/v1/npm/devices",
      );
      expect(limit).toBe(200);
    });

    it("should apply default limit for unauthenticated user", () => {
      const limit = simulateRateLimit(null, "/api/v1/ipam/networks");
      expect(limit).toBe(100);
    });

    it("should skip rate limiting for health endpoints", () => {
      const limit = simulateRateLimit(null, "/healthz");
      expect(limit).toBe(Infinity);
    });
  });
});

describe("Rate Limit Key Generation", () => {
  // Simulating the keyGenerator logic
  function generateKey(
    user: { userId?: string; role?: string } | null,
    path: string,
    ip: string,
  ): string {
    const AUTH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/register"];

    // For auth endpoints, always use IP to prevent credential stuffing
    if (AUTH_PATHS.some((authPath) => path === authPath)) {
      return `auth:${ip}`;
    }

    // Use user ID if authenticated, otherwise use IP
    if (user && user.userId) {
      return `user:${user.userId}`;
    }
    return `ip:${ip}`;
  }

  it("should use auth:ip format for login endpoint", () => {
    const key = generateKey(null, "/api/v1/auth/login", "192.168.1.1");
    expect(key).toBe("auth:192.168.1.1");
  });

  it("should use auth:ip format for register endpoint", () => {
    const key = generateKey(null, "/api/v1/auth/register", "10.0.0.1");
    expect(key).toBe("auth:10.0.0.1");
  });

  it("should use user:id format for authenticated users on regular endpoints", () => {
    const user = { userId: "user-123", role: "admin" };
    const key = generateKey(user, "/api/v1/ipam/networks", "192.168.1.1");
    expect(key).toBe("user:user-123");
  });

  it("should use ip: format for unauthenticated users on regular endpoints", () => {
    const key = generateKey(null, "/api/v1/ipam/networks", "192.168.1.1");
    expect(key).toBe("ip:192.168.1.1");
  });

  it("should use auth:ip even for authenticated users on auth endpoints", () => {
    const user = { userId: "user-123", role: "admin" };
    const key = generateKey(user, "/api/v1/auth/login", "192.168.1.1");
    expect(key).toBe("auth:192.168.1.1");
  });
});
