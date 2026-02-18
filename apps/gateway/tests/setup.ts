/**
 * GridWatch NetEnterprise - Jest Test Setup
 *
 * This file is run before each test file.
 */

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-only";
process.env.JWT_ALGORITHM = "HS256";
process.env.JWT_EXPIRES_IN = "1h";
process.env.POSTGRES_URL =
  "postgresql://test:test@localhost:5432/test_GridWatch";
process.env.REDIS_URL = "redis://localhost:6379/1";

// Mock external dependencies that require actual connections
jest.mock("../src/db", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
  closePool: jest.fn(),
  checkHealth: jest.fn().mockResolvedValue(true),
}));

jest.mock("../src/redis", () => ({
  redis: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  },
  closeRedis: jest.fn(),
}));

// Global test utilities
global.testUtils = {
  generateTestToken: (payload: Record<string, unknown> = {}) => {
    return "test-token";
  },
};

// Clean up after all tests
afterAll(async () => {
  // Cleanup resources if needed
});
