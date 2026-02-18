#!/bin/bash
# GridWatch NetEnterprise - NATS JetStream Stream Initialization
# Run this script after NATS is healthy to create streams

set -euo pipefail

NATS_URL="${NATS_URL:-nats://localhost:4222}"

echo "Waiting for NATS to be ready..."
until nats server check connection --server="$NATS_URL" 2>/dev/null; do
    echo "NATS not ready, waiting..."
    sleep 2
done

echo "NATS is ready. Creating JetStream streams..."

# ============================================
# SHARED STREAMS
# ============================================

# Audit events stream
nats stream add AUDITS \
    --server="$NATS_URL" \
    --subjects="shared.audit.>" \
    --storage=file \
    --retention=limits \
    --max-msgs=-1 \
    --max-bytes=1073741824 \
    --max-age=90d \
    --max-msg-size=1048576 \
    --discard=old \
    --dupe-window=2m \
    --replicas=1 \
    --no-allow-rollup \
    --deny-delete \
    --deny-purge \
    2>/dev/null || echo "Stream AUDITS already exists"

# Alert notifications stream
nats stream add ALERTS \
    --server="$NATS_URL" \
    --subjects="shared.alerts.>" \
    --storage=file \
    --retention=limits \
    --max-msgs=100000 \
    --max-bytes=536870912 \
    --max-age=30d \
    --max-msg-size=65536 \
    --discard=old \
    --dupe-window=1m \
    --replicas=1 \
    2>/dev/null || echo "Stream ALERTS already exists"

# ============================================
# IPAM STREAMS
# ============================================

# IPAM discovery events
nats stream add IPAM_DISCOVERY \
    --server="$NATS_URL" \
    --subjects="ipam.discovery.>" \
    --storage=file \
    --retention=workqueue \
    --max-msgs=50000 \
    --max-bytes=268435456 \
    --max-age=24h \
    --max-msg-size=65536 \
    --discard=old \
    --dupe-window=5m \
    --replicas=1 \
    2>/dev/null || echo "Stream IPAM_DISCOVERY already exists"

# IPAM scan results
nats stream add IPAM_SCANS \
    --server="$NATS_URL" \
    --subjects="ipam.scans.>" \
    --storage=file \
    --retention=limits \
    --max-msgs=-1 \
    --max-bytes=536870912 \
    --max-age=7d \
    --max-msg-size=262144 \
    --discard=old \
    --dupe-window=2m \
    --replicas=1 \
    2>/dev/null || echo "Stream IPAM_SCANS already exists"

# ============================================
# NPM STREAMS
# ============================================

# NPM metrics stream (high throughput)
nats stream add NPM_METRICS \
    --server="$NATS_URL" \
    --subjects="npm.metrics.>" \
    --storage=file \
    --retention=limits \
    --max-msgs=1000000 \
    --max-bytes=2147483648 \
    --max-age=1h \
    --max-msg-size=8192 \
    --discard=old \
    --dupe-window=30s \
    --replicas=1 \
    2>/dev/null || echo "Stream NPM_METRICS already exists"

# NPM device events
nats stream add NPM_DEVICES \
    --server="$NATS_URL" \
    --subjects="npm.devices.>" \
    --storage=file \
    --retention=limits \
    --max-msgs=100000 \
    --max-bytes=268435456 \
    --max-age=7d \
    --max-msg-size=65536 \
    --discard=old \
    --dupe-window=1m \
    --replicas=1 \
    2>/dev/null || echo "Stream NPM_DEVICES already exists"

# NPM interface events
nats stream add NPM_INTERFACES \
    --server="$NATS_URL" \
    --subjects="npm.interfaces.>" \
    --storage=file \
    --retention=limits \
    --max-msgs=500000 \
    --max-bytes=536870912 \
    --max-age=7d \
    --max-msg-size=32768 \
    --discard=old \
    --dupe-window=1m \
    --replicas=1 \
    2>/dev/null || echo "Stream NPM_INTERFACES already exists"

# ============================================
# STIG STREAMS
# ============================================

# STIG audit jobs
nats stream add STIG_AUDITS \
    --server="$NATS_URL" \
    --subjects="stig.audits.>" \
    --storage=file \
    --retention=workqueue \
    --max-msgs=10000 \
    --max-bytes=268435456 \
    --max-age=7d \
    --max-msg-size=262144 \
    --discard=old \
    --dupe-window=5m \
    --replicas=1 \
    2>/dev/null || echo "Stream STIG_AUDITS already exists"

# STIG compliance results
nats stream add STIG_RESULTS \
    --server="$NATS_URL" \
    --subjects="stig.results.>" \
    --storage=file \
    --retention=limits \
    --max-msgs=-1 \
    --max-bytes=1073741824 \
    --max-age=90d \
    --max-msg-size=524288 \
    --discard=old \
    --dupe-window=2m \
    --replicas=1 \
    2>/dev/null || echo "Stream STIG_RESULTS already exists"

# ============================================
# CONSUMERS
# ============================================

# Audit log consumer
nats consumer add AUDITS audit-processor \
    --server="$NATS_URL" \
    --ack=explicit \
    --deliver=all \
    --max-deliver=5 \
    --max-pending=1000 \
    --replay=instant \
    --filter="" \
    --pull \
    2>/dev/null || echo "Consumer audit-processor already exists"

# Alert notification consumer
nats consumer add ALERTS notification-service \
    --server="$NATS_URL" \
    --ack=explicit \
    --deliver=all \
    --max-deliver=3 \
    --max-pending=500 \
    --replay=instant \
    --filter="" \
    --pull \
    2>/dev/null || echo "Consumer notification-service already exists"

# NPM metrics to VictoriaMetrics consumer
nats consumer add NPM_METRICS victoriametrics-writer \
    --server="$NATS_URL" \
    --ack=explicit \
    --deliver=all \
    --max-deliver=3 \
    --max-pending=10000 \
    --replay=instant \
    --filter="" \
    --pull \
    2>/dev/null || echo "Consumer victoriametrics-writer already exists"

# STIG report generator consumer
nats consumer add STIG_RESULTS report-generator \
    --server="$NATS_URL" \
    --ack=explicit \
    --deliver=all \
    --max-deliver=3 \
    --max-pending=100 \
    --replay=instant \
    --filter="" \
    --pull \
    2>/dev/null || echo "Consumer report-generator already exists"

echo ""
echo "============================================"
echo "JetStream streams created successfully!"
echo "============================================"
echo ""

# Display stream info
nats stream list --server="$NATS_URL"
