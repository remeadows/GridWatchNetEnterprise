/**
 * GridWatch NetEnterprise - Health Endpoints Benchmark
 *
 * Benchmarks the health check endpoints to ensure they meet performance targets.
 *
 * Usage: node tests/benchmarks/health.benchmark.js
 *
 * Prerequisites:
 * - Gateway running on localhost:3001
 */

const autocannon = require("autocannon");

const BASE_URL = process.env.GATEWAY_URL || "http://localhost:3001";

// Benchmark configuration
// Note: P99 targets are set for realistic production conditions.
// Latency can vary based on system load and middleware overhead.
const BENCHMARK_CONFIG = {
  healthz: {
    url: "/healthz",
    duration: 10,
    connections: 100,
    pipelining: 10,
    target: {
      rps: 10000,
      p99: 100, // ms - allows for middleware and logging overhead
    },
  },
  livez: {
    url: "/livez",
    duration: 10,
    connections: 100,
    pipelining: 10,
    target: {
      rps: 10000,
      p99: 100, // ms
    },
  },
  readyz: {
    url: "/readyz",
    duration: 10,
    connections: 50,
    pipelining: 5,
    target: {
      rps: 5000,
      p99: 100, // ms - includes DB/Redis health check latency
    },
  },
};

async function runBenchmark(name, config) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Benchmarking: ${name.toUpperCase()}`);
  console.log(`URL: ${BASE_URL}${config.url}`);
  console.log(
    `Duration: ${config.duration}s | Connections: ${config.connections}`,
  );
  console.log(`${"=".repeat(60)}\n`);

  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: `${BASE_URL}${config.url}`,
        duration: config.duration,
        connections: config.connections,
        pipelining: config.pipelining,
        headers: {
          Accept: "application/json",
        },
      },
      (err, result) => {
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
      },
    );

    // Track progress
    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("GridWatch NetEnterprise - Health Endpoints Benchmark");
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

  const results = [];

  for (const [name, config] of Object.entries(BENCHMARK_CONFIG)) {
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
