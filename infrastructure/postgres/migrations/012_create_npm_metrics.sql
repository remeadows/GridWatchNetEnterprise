-- Migration 012: Create NPM device_metrics table
-- For databases initialized before NPM metrics were available

-- Device Metrics (time-series storage for CPU, memory, latency, availability)
CREATE TABLE IF NOT EXISTS npm.device_metrics (
    id UUID DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES npm.devices(id) ON DELETE CASCADE,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- ICMP metrics
    icmp_latency_ms NUMERIC(10, 3),
    icmp_packet_loss_percent NUMERIC(5, 2),
    icmp_reachable BOOLEAN,
    -- SNMP metrics (vendor-agnostic)
    cpu_utilization_percent NUMERIC(5, 2),
    memory_utilization_percent NUMERIC(5, 2),
    memory_total_bytes BIGINT,
    memory_used_bytes BIGINT,
    uptime_seconds BIGINT,
    -- Temperature (if available)
    temperature_celsius NUMERIC(5, 2),
    -- Disk/Storage metrics
    disk_utilization_percent NUMERIC(5, 2),
    disk_total_bytes BIGINT,
    disk_used_bytes BIGINT,
    swap_utilization_percent NUMERIC(5, 2),
    swap_total_bytes BIGINT,
    -- Interface summary
    total_interfaces INTEGER,
    interfaces_up INTEGER,
    interfaces_down INTEGER,
    total_in_octets BIGINT,
    total_out_octets BIGINT,
    total_in_errors BIGINT,
    total_out_errors BIGINT,
    -- Service status (vendor-specific, stored as JSON)
    services_status JSONB,
    -- Availability calculation (based on poll results)
    is_available BOOLEAN DEFAULT false,
    -- Composite primary key for partitioned table
    PRIMARY KEY (id, collected_at)
) PARTITION BY RANGE (collected_at);

-- Create default partition
CREATE TABLE IF NOT EXISTS npm.device_metrics_default PARTITION OF npm.device_metrics DEFAULT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_device_metrics_device ON npm.device_metrics(device_id);
CREATE INDEX IF NOT EXISTS idx_device_metrics_collected ON npm.device_metrics(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_metrics_device_time ON npm.device_metrics(device_id, collected_at DESC);

-- Interface Metrics (if not exists)
CREATE TABLE IF NOT EXISTS npm.interface_metrics (
    id UUID DEFAULT uuid_generate_v4(),
    interface_id UUID REFERENCES npm.interfaces(id) ON DELETE CASCADE,
    device_id UUID REFERENCES npm.devices(id) ON DELETE CASCADE,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Traffic counters (64-bit)
    in_octets BIGINT,
    out_octets BIGINT,
    in_packets BIGINT,
    out_packets BIGINT,
    -- Error counters
    in_errors BIGINT,
    out_errors BIGINT,
    in_discards BIGINT,
    out_discards BIGINT,
    -- Calculated rates (per second, calculated by collector)
    in_octets_rate NUMERIC(18, 2),
    out_octets_rate NUMERIC(18, 2),
    -- Utilization (calculated from rate and interface speed)
    utilization_in_percent NUMERIC(5, 2),
    utilization_out_percent NUMERIC(5, 2),
    PRIMARY KEY (id, collected_at)
) PARTITION BY RANGE (collected_at);

-- Create default partition for interface metrics
CREATE TABLE IF NOT EXISTS npm.interface_metrics_default PARTITION OF npm.interface_metrics DEFAULT;

-- Create indexes for interface metrics
CREATE INDEX IF NOT EXISTS idx_interface_metrics_interface ON npm.interface_metrics(interface_id);
CREATE INDEX IF NOT EXISTS idx_interface_metrics_device ON npm.interface_metrics(device_id);
CREATE INDEX IF NOT EXISTS idx_interface_metrics_collected ON npm.interface_metrics(collected_at DESC);

-- Volume Metrics (if not exists)
CREATE TABLE IF NOT EXISTS npm.volume_metrics (
    id UUID DEFAULT uuid_generate_v4(),
    volume_id UUID REFERENCES npm.volumes(id) ON DELETE CASCADE,
    device_id UUID REFERENCES npm.devices(id) ON DELETE CASCADE,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Storage utilization
    used_bytes BIGINT,
    available_bytes BIGINT,
    utilization_percent NUMERIC(5, 2),
    PRIMARY KEY (id, collected_at)
) PARTITION BY RANGE (collected_at);

-- Create default partition for volume metrics
CREATE TABLE IF NOT EXISTS npm.volume_metrics_default PARTITION OF npm.volume_metrics DEFAULT;

-- Create indexes for volume metrics
CREATE INDEX IF NOT EXISTS idx_volume_metrics_volume ON npm.volume_metrics(volume_id);
CREATE INDEX IF NOT EXISTS idx_volume_metrics_device ON npm.volume_metrics(device_id);
CREATE INDEX IF NOT EXISTS idx_volume_metrics_collected ON npm.volume_metrics(collected_at DESC);
