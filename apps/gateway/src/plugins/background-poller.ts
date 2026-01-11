import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { spawn } from "child_process";
import { pool } from "../db";
import { logger } from "../logger";

interface PollerConfig {
  enabled: boolean;
  defaultIntervalMs: number;
  maxConcurrentPolls: number;
  batchSize: number;
}

interface DeviceToPoll {
  id: string;
  name: string;
  ipAddress: string;
  pollIcmp: boolean;
  pollSnmp: boolean;
  pollInterval: number;
  lastPoll: Date | null;
}

const DEFAULT_CONFIG: PollerConfig = {
  enabled: true,
  defaultIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxConcurrentPolls: 50,
  batchSize: 100,
};

class BackgroundPoller {
  private fastify: FastifyInstance;
  private config: PollerConfig;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private activePolls = 0;
  private pollCycleCount = 0;

  constructor(fastify: FastifyInstance, config: Partial<PollerConfig> = {}) {
    this.fastify = fastify;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Background poller already running");
      return;
    }

    this.isRunning = true;
    logger.info(
      {
        intervalMs: this.config.defaultIntervalMs,
        maxConcurrent: this.config.maxConcurrentPolls,
      },
      "Starting NPM background poller",
    );

    // Run initial poll cycle after a short delay to allow startup
    setTimeout(() => this.runPollCycle(), 5000);

    // Schedule recurring poll cycles
    this.pollTimer = setInterval(
      () => this.runPollCycle(),
      this.config.defaultIntervalMs,
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    logger.info("Background poller stopped");
  }

  private async runPollCycle(): Promise<void> {
    if (!this.isRunning) return;

    this.pollCycleCount++;
    const cycleId = this.pollCycleCount;
    const cycleStart = Date.now();

    try {
      // Get devices that need polling
      const devices = await this.getDevicesToPoll();

      if (devices.length === 0) {
        logger.debug({ cycleId }, "No devices to poll in this cycle");
        return;
      }

      logger.info(
        { cycleId, deviceCount: devices.length },
        "Starting poll cycle",
      );

      // Poll devices in batches with concurrency control
      let polledCount = 0;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < devices.length; i += this.config.batchSize) {
        const batch = devices.slice(i, i + this.config.batchSize);

        // Wait if we have too many concurrent polls
        while (this.activePolls >= this.config.maxConcurrentPolls) {
          await this.sleep(100);
        }

        // Poll batch concurrently
        const results = await Promise.allSettled(
          batch.map((device) => this.pollDevice(device)),
        );

        for (const result of results) {
          polledCount++;
          if (result.status === "fulfilled" && result.value) {
            successCount++;
          } else {
            failCount++;
          }
        }
      }

      const cycleDuration = Date.now() - cycleStart;
      logger.info(
        {
          cycleId,
          polledCount,
          successCount,
          failCount,
          durationMs: cycleDuration,
        },
        "Poll cycle completed",
      );
    } catch (err) {
      logger.error({ cycleId, err }, "Error in poll cycle");
    }
  }

  private async getDevicesToPoll(): Promise<DeviceToPoll[]> {
    // Get active devices that are due for polling
    // A device is due if: last_poll is NULL OR last_poll + poll_interval < NOW()
    const result = await pool.query(
      `SELECT
        d.id, d.name, d.ip_address, d.poll_icmp, d.poll_snmp, d.poll_interval,
        d.last_poll
       FROM npm.devices d
       WHERE d.is_active = true
         AND (d.poll_icmp = true OR d.poll_snmp = true)
         AND (
           d.last_poll IS NULL
           OR d.last_poll + (d.poll_interval || ' seconds')::interval < NOW()
         )
       ORDER BY d.last_poll ASC NULLS FIRST
       LIMIT 1000`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      ipAddress: row.ip_address,
      pollIcmp: row.poll_icmp,
      pollSnmp: row.poll_snmp,
      pollInterval: row.poll_interval,
      lastPoll: row.last_poll,
    }));
  }

  private async pollDevice(device: DeviceToPoll): Promise<boolean> {
    this.activePolls++;
    const pollStart = Date.now();

    try {
      let icmpSuccess = true;
      let icmpLatency: number | null = null;

      // Perform ICMP poll if enabled
      if (device.pollIcmp) {
        const icmpResult = await this.performIcmpPoll(device.ipAddress);
        icmpSuccess = icmpResult.success;
        icmpLatency = icmpResult.latencyMs;

        // Update ICMP status
        const newIcmpStatus = icmpSuccess ? "up" : "down";
        await pool.query(
          `UPDATE npm.devices
           SET icmp_status = $1, last_icmp_poll = NOW()
           WHERE id = $2`,
          [newIcmpStatus, device.id],
        );
      }

      // Update overall device status and last_poll
      const overallStatus = icmpSuccess ? "up" : "down";
      await pool.query(
        `UPDATE npm.devices
         SET status = CASE
               WHEN icmp_status = 'up' OR snmp_status = 'up' THEN 'up'
               ELSE 'down'
             END,
             last_poll = NOW()
         WHERE id = $1`,
        [device.id],
      );

      // Insert metrics record
      const isReachable = icmpSuccess === true;
      await pool.query(
        `INSERT INTO npm.device_metrics (device_id, icmp_latency_ms, icmp_reachable, is_available, collected_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [device.id, icmpLatency, isReachable, isReachable],
      );

      const pollDuration = Date.now() - pollStart;
      logger.debug(
        {
          deviceId: device.id,
          deviceName: device.name,
          icmpSuccess,
          latencyMs: icmpLatency,
          pollDurationMs: pollDuration,
        },
        "Device poll completed",
      );

      return icmpSuccess;
    } catch (err) {
      logger.error(
        { deviceId: device.id, deviceName: device.name, err },
        "Error polling device",
      );
      return false;
    } finally {
      this.activePolls--;
    }
  }

  private async performIcmpPoll(
    ipAddress: string,
  ): Promise<{ success: boolean; latencyMs: number | null }> {
    return new Promise((resolve) => {
      const isWindows = process.platform === "win32";
      const pingArgs = isWindows
        ? ["-n", "1", "-w", "2000", ipAddress]
        : ["-c", "1", "-W", "2", ipAddress];

      const pingStartTime = Date.now();
      const ping = spawn("ping", pingArgs);
      let stdout = "";
      let resolved = false;

      const resolveOnce = (result: {
        success: boolean;
        latencyMs: number | null;
      }) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      ping.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      ping.on("close", (code: number) => {
        if (code === 0) {
          // Parse latency from output
          const timeMatch = stdout.match(/time[=<](\d+(?:\.\d+)?)\s*ms/i);
          const latencyMs =
            timeMatch && timeMatch[1]
              ? parseFloat(timeMatch[1])
              : Date.now() - pingStartTime;
          resolveOnce({ success: true, latencyMs });
        } else {
          resolveOnce({ success: false, latencyMs: null });
        }
      });

      ping.on("error", () => {
        resolveOnce({ success: false, latencyMs: null });
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        ping.kill();
        resolveOnce({ success: false, latencyMs: null });
      }, 5000);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus(): {
    isRunning: boolean;
    activePolls: number;
    pollCycleCount: number;
    config: PollerConfig;
  } {
    return {
      isRunning: this.isRunning,
      activePolls: this.activePolls,
      pollCycleCount: this.pollCycleCount,
      config: this.config,
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    backgroundPoller: BackgroundPoller;
  }
}

const backgroundPollerPlugin: FastifyPluginAsync = async (fastify) => {
  // Get config from environment
  const config: Partial<PollerConfig> = {
    enabled: process.env.NPM_POLLER_ENABLED !== "false",
    defaultIntervalMs: parseInt(
      process.env.NPM_POLL_INTERVAL_MS || String(5 * 60 * 1000),
      10,
    ),
    maxConcurrentPolls: parseInt(
      process.env.NPM_MAX_CONCURRENT_POLLS || "50",
      10,
    ),
    batchSize: parseInt(process.env.NPM_POLL_BATCH_SIZE || "100", 10),
  };

  const poller = new BackgroundPoller(fastify, config);

  // Decorate fastify instance
  fastify.decorate("backgroundPoller", poller);

  // Start poller when server is ready
  fastify.addHook("onReady", async () => {
    if (config.enabled) {
      await poller.start();
    } else {
      logger.info("Background poller disabled via configuration");
    }
  });

  // Stop poller on shutdown
  fastify.addHook("onClose", async () => {
    await poller.stop();
  });

  // Add status endpoint
  fastify.get(
    "/api/v1/npm/poller/status",
    {
      schema: {
        tags: ["NPM - Poller"],
        summary: "Get background poller status",
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.requireAuth],
    },
    async () => {
      return {
        success: true,
        data: poller.getStatus(),
      };
    },
  );

  // Add control endpoints (admin only)
  fastify.post(
    "/api/v1/npm/poller/start",
    {
      schema: {
        tags: ["NPM - Poller"],
        summary: "Start background poller",
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async () => {
      await poller.start();
      return {
        success: true,
        message: "Background poller started",
        data: poller.getStatus(),
      };
    },
  );

  fastify.post(
    "/api/v1/npm/poller/stop",
    {
      schema: {
        tags: ["NPM - Poller"],
        summary: "Stop background poller",
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async () => {
      await poller.stop();
      return {
        success: true,
        message: "Background poller stopped",
        data: poller.getStatus(),
      };
    },
  );
};

export default fp(backgroundPollerPlugin, {
  name: "background-poller",
  dependencies: ["auth"],
});
