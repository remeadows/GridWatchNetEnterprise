/**
 * NetNynja Enterprise - SNMPv3 Client Utilities
 * Provides SNMPv3 testing and querying capabilities
 */

import snmp from "net-snmp";
import { logger } from "./logger";

// Standard OIDs for device identification
const OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0";
const OID_SYS_NAME = "1.3.6.1.2.1.1.5.0";
const OID_SYS_UPTIME = "1.3.6.1.2.1.1.3.0";
const OID_SYS_CONTACT = "1.3.6.1.2.1.1.4.0";
const OID_SYS_LOCATION = "1.3.6.1.2.1.1.6.0";

// Auth protocol mapping
const AUTH_PROTOCOLS: Record<string, number> = {
  SHA: snmp.AuthProtocols.sha,
  "SHA-224": snmp.AuthProtocols.sha224,
  "SHA-256": snmp.AuthProtocols.sha256,
  "SHA-384": snmp.AuthProtocols.sha384,
  "SHA-512": snmp.AuthProtocols.sha512,
};

// Privacy protocol mapping
// Note: net-snmp uses aes256b (Blumenthal) or aes256r (Reeder) for AES-256
// Most vendors (Cisco, Arista, Juniper) use Reeder (aes256r)
const PRIV_PROTOCOLS: Record<string, number> = {
  AES: snmp.PrivProtocols.aes,
  "AES-128": snmp.PrivProtocols.aes,
  "AES-192": snmp.PrivProtocols.aes, // Fallback to AES-128, no native 192 support
  "AES-256": snmp.PrivProtocols.aes256r, // Reeder variant (most common)
  "AES-256-B": snmp.PrivProtocols.aes256b, // Blumenthal variant
  "AES-256-R": snmp.PrivProtocols.aes256r, // Reeder variant (explicit)
};

// Security level mapping
const SECURITY_LEVELS: Record<string, number> = {
  noAuthNoPriv: snmp.SecurityLevel.noAuthNoPriv,
  authNoPriv: snmp.SecurityLevel.authNoPriv,
  authPriv: snmp.SecurityLevel.authPriv,
};

export interface SNMPv3Credential {
  username: string;
  securityLevel: "noAuthNoPriv" | "authNoPriv" | "authPriv";
  authProtocol?: string;
  authPassword?: string;
  privProtocol?: string;
  privPassword?: string;
  contextName?: string;
  contextEngineId?: string;
}

export interface SNMPTestResult {
  success: boolean;
  responseTimeMs: number;
  sysDescr?: string;
  sysName?: string;
  sysUptime?: number;
  sysContact?: string;
  sysLocation?: string;
  error?: string;
}

/**
 * Test SNMPv3 credentials against a target device
 */
export async function testSNMPv3Credential(
  targetIp: string,
  port: number,
  credential: SNMPv3Credential,
  timeoutMs: number = 10000, // Increased for SNMPv3 authPriv with SHA-256/AES-256
): Promise<SNMPTestResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    try {
      // Build user options based on security level
      const userOptions: snmp.UserOptions = {
        name: credential.username,
        level:
          SECURITY_LEVELS[credential.securityLevel] ??
          snmp.SecurityLevel.authPriv,
      };

      // Add auth settings if needed
      if (
        credential.securityLevel === "authNoPriv" ||
        credential.securityLevel === "authPriv"
      ) {
        if (credential.authProtocol && credential.authPassword) {
          userOptions.authProtocol =
            AUTH_PROTOCOLS[credential.authProtocol] ?? snmp.AuthProtocols.sha;
          userOptions.authKey = credential.authPassword;
        }
      }

      // Add privacy settings if needed
      if (credential.securityLevel === "authPriv") {
        if (credential.privProtocol && credential.privPassword) {
          userOptions.privProtocol =
            PRIV_PROTOCOLS[credential.privProtocol] ?? snmp.PrivProtocols.aes;
          userOptions.privKey = credential.privPassword;
        }
      }

      // Session options - increased retries for SNMPv3 engine ID discovery
      const sessionOptions: snmp.SessionOptions = {
        port,
        retries: 2, // Increased from 1 to allow for engine ID discovery
        timeout: timeoutMs,
        version: snmp.Version3,
      };

      // Log SNMPv3 configuration for debugging
      logger.debug(
        {
          targetIp,
          port,
          username: credential.username,
          securityLevel: credential.securityLevel,
          authProtocol: credential.authProtocol,
          privProtocol: credential.privProtocol,
          authProtocolMapped: userOptions.authProtocol,
          privProtocolMapped: userOptions.privProtocol,
          timeoutMs,
        },
        "SNMPv3 session config",
      );

      // Create SNMPv3 session
      const session = snmp.createV3Session(
        targetIp,
        userOptions,
        sessionOptions,
      );

      // OIDs to query for device info
      const oids = [
        OID_SYS_DESCR,
        OID_SYS_NAME,
        OID_SYS_UPTIME,
        OID_SYS_CONTACT,
        OID_SYS_LOCATION,
      ];

      session.get(oids, (error: Error | null, varbinds: snmp.VarBind[]) => {
        const responseTimeMs = Date.now() - startTime;
        session.close();

        if (error) {
          logger.warn(
            {
              error: error.message,
              errorName: error.name,
              errorStack: error.stack,
              targetIp,
              port,
              responseTimeMs,
              username: credential.username,
              securityLevel: credential.securityLevel,
              authProtocol: credential.authProtocol,
              privProtocol: credential.privProtocol,
            },
            "SNMPv3 test failed",
          );
          resolve({
            success: false,
            responseTimeMs,
            error: error.message,
          });
          return;
        }

        // Parse results
        const result: SNMPTestResult = {
          success: true,
          responseTimeMs,
        };

        for (const varbind of varbinds) {
          if (snmp.isVarbindError(varbind)) {
            continue;
          }

          const oid = varbind.oid;
          const value = varbind.value;

          if (oid === OID_SYS_DESCR) {
            result.sysDescr = value?.toString();
          } else if (oid === OID_SYS_NAME) {
            result.sysName = value?.toString();
          } else if (oid === OID_SYS_UPTIME) {
            // sysUpTime is in hundredths of a second
            result.sysUptime =
              typeof value === "number" ? Math.floor(value / 100) : undefined;
          } else if (oid === OID_SYS_CONTACT) {
            result.sysContact = value?.toString();
          } else if (oid === OID_SYS_LOCATION) {
            result.sysLocation = value?.toString();
          }
        }

        logger.info(
          {
            targetIp,
            port,
            responseTimeMs,
            sysName: result.sysName,
          },
          "SNMPv3 test successful",
        );

        resolve(result);
      });

      // Handle session errors
      session.on("error", (error: Error) => {
        const responseTimeMs = Date.now() - startTime;
        session.close();
        logger.error(
          { error: error.message, targetIp, port },
          "SNMPv3 session error",
        );
        resolve({
          success: false,
          responseTimeMs,
          error: error.message,
        });
      });
    } catch (err) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { error: errorMessage, targetIp, port },
        "SNMPv3 test exception",
      );
      resolve({
        success: false,
        responseTimeMs,
        error: errorMessage,
      });
    }
  });
}
