/**
 * GridWatch NetEnterprise - Authentication Endpoints Benchmark
 *
 * Benchmarks the authentication endpoints to ensure they meet performance targets.
 *
 * Usage: node tests/benchmarks/auth.benchmark.js
 *
 * Prerequisites:
 * - Gateway running on localhost:3001
 * - PostgreSQL and Redis running
 * - Test user credentials available
 */

const autocannon = require("autocannon");

const BASE_URL = process.env.GATEWAY_URL || "http://localhost:3001";

// Test credentials (should match seeded test data)
const TEST_USER = {
  username: "admin",
  password: "admin123",
};

// Benchmark configuration
const BENCHMARK_CONFIG = {
  login: {
    url: "/api/v1/auth/login",
    method: "POST",
    body: JSON.stringify(TEST_USER),
    duration: 10,
    connections: 10,
    pipelining: 1,
    target: {
      rps: 100,
      p99: 500, // ms - auth operations are slower due to password hashing
    },
  },
  profile: {
    url: "/api/v1/auth/profile",
    method: "GET",
    duration: 10,
    connections: 50,
    pipelining: 5,
    target: {
      rps: 2000,
      p99: 50, // ms
    },
    requiresAuth: true,
  },
  refresh: {
    url: "/api/v1/auth/refresh",
    method: "POST",
    duration: 10,
    connections: 20,
    pipelining: 2,
    target: {
      rps: 500,
      p99: 100, // ms
    },
    requiresRefreshToken: true,
  },
};

let authToken = null;
let refreshToken = null;

async function authenticate() {
  console.log("Authenticating to get tokens...");
  try {
    const response = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(TEST_USER),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Authentication failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    authToken = data.accessToken;
    refreshToken = data.refreshToken;
    console.log("Authentication successful.\n");
    return true;
  } catch (error) {
    console.error(`Authentication error: ${error.message}`);
    return false;
  }
}

async function runBenchmark(name, config) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Benchmarking: ${name.toUpperCase()}`);
  console.log(`URL: ${BASE_URL}${config.url}`);
  console.log(`Method: ${config.method}`);
  console.log(
    `Duration: ${config.duration}s | Connections: ${config.connections}`,
  );
  console.log(`${"=".repeat(60)}\n`);

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (config.requiresAuth && authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const autocannonConfig = {
    url: `${BASE_URL}${config.url}`,
    duration: config.duration,
    connections: config.connections,
    pipelining: config.pipelining,
    method: config.method,
    headers,
  };

  if (config.body) {
    autocannonConfig.body = config.body;
  }

  if (config.requiresRefreshToken && refreshToken) {
    autocannonConfig.body = JSON.stringify({ refreshToken });
  }

  return new Promise((resolve, reject) => {
    const instance = autocannon(autocannonConfig, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      // Print results
      console.log("\nResults:");
      console.log(
        `  Requests/sec: ${result.requests.average.toLocaleString()}`,
      );
      console.log(
        `  Total requests: ${result.requests.total.toLocaleString()}`,
      );
      console.log(`  Latency (avg): ${result.latency.average.toFixed(2)}ms`);
      console.log(`  Latency (p50): ${result.latency.p50}ms`);
      console.log(`  Latency (p99): ${result.latency.p99}ms`);
      console.log(`  Errors: ${result.errors}`);
      console.log(`  Timeouts: ${result.timeouts}`);
      console.log(`  2xx responses: ${result["2xx"]}`);
      console.log(`  Non-2xx responses: ${result.non2xx}`);

      // Check against targets
      const passedRps = result.requests.average >= config.target.rps;
      const passedLatency = result.latency.p99 <= config.target.p99;
      const passedErrors = result.errors === 0;

      console.log(`\nTargets:`);
      console.log(
        `  RPS >= ${config.target.rps}: ${passedRps ? "✅ PASS" : "❌ FAIL"}`,
      );
      console.log(
        `  P99 <= ${config.target.p99}ms: ${passedLatency ? "✅ PASS" : "❌ FAIL"}`,
      );
      console.log(`  Errors = 0: ${passedErrors ? "✅ PASS" : "❌ FAIL"}`);

      resolve({
        name,
        passed: passedRps && passedLatency && passedErrors,
        result,
      });
    });

    // Track progress
    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("GridWatch NetEnterprise - Authentication Endpoints Benchmark");
  console.log("=".repeat(60));
  console.log(`\nGateway URL: ${BASE_URL}`);
  console.log("Starting benchmarks...\n");

  // Check if gateway is available
  try {
    const response = await fetch(`${BASE_URL}/healthz`);
    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }
    console.log("Gateway is available.\n");
  } catch (error) {
    console.error(`\n❌ Error: Gateway not available at ${BASE_URL}`);
    console.error("Please ensure the gateway is running.");
    console.error(`Details: ${error.message}\n`);
    process.exit(1);
  }

  // Authenticate first
  const authenticated = await authenticate();
  if (!authenticated) {
    console.error(
      "\n❌ Error: Could not authenticate. Skipping auth-protected benchmarks.",
    );
  }

  const results = [];

  for (const [name, config] of Object.entries(BENCHMARK_CONFIG)) {
    // Skip auth-protected benchmarks if not authenticated
    if (
      (config.requiresAuth || config.requiresRefreshToken) &&
      !authenticated
    ) {
      console.log(`\nSkipping ${name} - requires authentication`);
      results.push({ name, passed: false, error: "Not authenticated" });
      continue;
    }

    try {
      const result = await runBenchmark(name, config);
      results.push(result);
    } catch (error) {
      console.error(`Error benchmarking ${name}:`, error.message);
      results.push({ name, passed: false, error: error.message });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(60) + "\n");

  const allPassed = results.every((r) => r.passed);

  for (const result of results) {
    console.log(`  ${result.name}: ${result.passed ? "✅ PASS" : "❌ FAIL"}`);
  }

  console.log(
    `\nOverall: ${allPassed ? "✅ ALL BENCHMARKS PASSED" : "❌ SOME BENCHMARKS FAILED"}\n`,
  );

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
