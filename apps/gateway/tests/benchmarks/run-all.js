#!/usr/bin/env node

/**
 * GridWatch NetEnterprise - Run All Benchmarks
 *
 * Runs all benchmark suites and generates a summary report.
 *
 * Usage: node tests/benchmarks/run-all.js
 *
 * Options:
 *   --health-only    Run only health benchmarks
 *   --auth-only      Run only auth benchmarks
 *   --ipam-only      Run only IPAM benchmarks
 *   --json           Output results as JSON
 *
 * Prerequisites:
 * - Gateway running on localhost:3001
 * - All dependent services running
 */

const { spawn } = require("child_process");
const path = require("path");

const BENCHMARKS = [
  {
    name: "health",
    file: "health.benchmark.js",
    description: "Health Endpoints",
  },
  {
    name: "auth",
    file: "auth.benchmark.js",
    description: "Authentication Endpoints",
  },
  { name: "ipam", file: "ipam.benchmark.js", description: "IPAM Endpoints" },
];

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const healthOnly = args.includes("--health-only");
const authOnly = args.includes("--auth-only");
const ipamOnly = args.includes("--ipam-only");

function runBenchmark(benchmark) {
  return new Promise((resolve) => {
    const benchmarkPath = path.join(__dirname, benchmark.file);

    if (!jsonOutput) {
      console.log(`\n${"#".repeat(70)}`);
      console.log(`# Running: ${benchmark.description}`);
      console.log(`${"#".repeat(70)}`);
    }

    const child = spawn("node", [benchmarkPath], {
      stdio: jsonOutput ? "pipe" : "inherit",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    if (jsonOutput) {
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
    }

    child.on("close", (code) => {
      resolve({
        name: benchmark.name,
        description: benchmark.description,
        passed: code === 0,
        exitCode: code,
        stdout,
        stderr,
      });
    });

    child.on("error", (error) => {
      resolve({
        name: benchmark.name,
        description: benchmark.description,
        passed: false,
        exitCode: -1,
        error: error.message,
      });
    });
  });
}

async function main() {
  const startTime = Date.now();

  if (!jsonOutput) {
    console.log("\n" + "=".repeat(70));
    console.log("GridWatch NetEnterprise - Performance Benchmark Suite");
    console.log("=".repeat(70));
    console.log(`\nStarted at: ${new Date().toISOString()}`);
  }

  // Filter benchmarks based on flags
  let benchmarksToRun = BENCHMARKS;
  if (healthOnly) {
    benchmarksToRun = BENCHMARKS.filter((b) => b.name === "health");
  } else if (authOnly) {
    benchmarksToRun = BENCHMARKS.filter((b) => b.name === "auth");
  } else if (ipamOnly) {
    benchmarksToRun = BENCHMARKS.filter((b) => b.name === "ipam");
  }

  const results = [];
  for (const benchmark of benchmarksToRun) {
    const result = await runBenchmark(benchmark);
    results.push(result);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(1);
  const allPassed = results.every((r) => r.passed);

  if (jsonOutput) {
    const output = {
      timestamp: new Date().toISOString(),
      duration: `${duration}s`,
      allPassed,
      results: results.map((r) => ({
        name: r.name,
        description: r.description,
        passed: r.passed,
        exitCode: r.exitCode,
        error: r.error,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Print summary
    console.log("\n" + "=".repeat(70));
    console.log("OVERALL BENCHMARK SUMMARY");
    console.log("=".repeat(70));
    console.log(`\nCompleted in: ${duration}s`);
    console.log("\nResults by suite:");

    for (const result of results) {
      const status = result.passed ? "✅ PASS" : "❌ FAIL";
      console.log(`  ${result.description}: ${status}`);
    }

    console.log(
      `\nOverall: ${allPassed ? "✅ ALL BENCHMARK SUITES PASSED" : "❌ SOME BENCHMARK SUITES FAILED"}`,
    );
    console.log("");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Benchmark runner failed:", error);
  process.exit(1);
});
