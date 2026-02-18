/**
 * GridWatch NetEnterprise - NATS JetStream Setup Script
 * Creates required streams for E2E testing
 *
 * Run with: npx tsx Testing/setup-nats-streams.ts
 */

import {
  connect,
  StringCodec,
  AckPolicy,
  RetentionPolicy,
  StorageType,
} from "nats";

const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";

// Stream configurations (matching actual service stream names)
// Note: Services create these streams on startup, this script ensures they exist for E2E tests
const STREAMS = [
  {
    name: "IPAM",
    subjects: ["ipam.scan.*", "ipam.discovery.*"],
    description: "IPAM network scan and discovery events",
  },
  {
    name: "NPM_METRICS",
    subjects: ["npm.metrics.*"],
    description: "NPM performance metrics",
  },
  {
    name: "STIG",
    subjects: ["stig.audits.*", "stig.reports.*", "stig.results.*"],
    description: "STIG audit and compliance events",
  },
  {
    name: "SHARED_ALERTS",
    subjects: ["shared.alerts.*"],
    description: "Cross-module alert events",
  },
  {
    name: "SHARED_AUDIT",
    subjects: ["shared.audit.*"],
    description: "Cross-module audit log events",
  },
];

async function main() {
  console.log(`🔌 Connecting to NATS at ${NATS_URL}...\n`);

  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();
  const jsm = await js.jetstreamManager();

  console.log("📦 Creating JetStream streams...\n");

  for (const streamConfig of STREAMS) {
    console.log(`Creating stream: ${streamConfig.name}`);
    console.log(`  Subjects: ${streamConfig.subjects.join(", ")}`);

    try {
      // Check if stream exists
      try {
        const info = await jsm.streams.info(streamConfig.name);
        console.log(
          `  ✓ Stream already exists (${info.state.messages} messages)`,
        );
        continue;
      } catch {
        // Stream doesn't exist, create it
      }

      // Create the stream
      await jsm.streams.add({
        name: streamConfig.name,
        subjects: streamConfig.subjects,
        description: streamConfig.description,
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
        max_msgs: 100000,
        max_bytes: 100 * 1024 * 1024, // 100MB
        max_age: 7 * 24 * 60 * 60 * 1000000000, // 7 days in nanoseconds
        max_msg_size: 1024 * 1024, // 1MB
        discard: "old" as any,
        duplicate_window: 60 * 1000000000, // 60 seconds
      });

      console.log(`  ✓ Created stream ${streamConfig.name}`);
    } catch (error) {
      console.error(`  ✗ Error creating ${streamConfig.name}:`, error);
    }
  }

  // List all streams
  console.log("\n📋 Current JetStream Streams:");
  const streams = await jsm.streams.list().next();
  for (const stream of streams) {
    console.log(`  - ${stream.config.name}: ${stream.state.messages} messages`);
  }

  await nc.drain();
  console.log("\n✅ NATS JetStream setup complete!");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
