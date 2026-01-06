/**
 * NetNynja Enterprise - OpenTelemetry Instrumentation
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { config } from '../config';
import { logger } from '../logger';

let sdk: NodeSDK | null = null;

export function initTelemetry(): void {
  if (!config.OTEL_ENABLED) {
    logger.info('OpenTelemetry disabled');
    return;
  }

  const resource = new Resource({
    'service.name': 'netnynja-gateway',
    'service.version': '0.1.0',
    'deployment.environment': config.NODE_ENV,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${config.OTEL_EXPORTER_ENDPOINT}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${config.OTEL_EXPORTER_ENDPOINT}/v1/metrics`,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        '@opentelemetry/instrumentation-redis-4': { enabled: true },
      }),
    ],
  });

  sdk.start();
  logger.info({ endpoint: config.OTEL_EXPORTER_ENDPOINT }, 'OpenTelemetry initialized');
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    logger.info('OpenTelemetry shutdown complete');
  }
}
