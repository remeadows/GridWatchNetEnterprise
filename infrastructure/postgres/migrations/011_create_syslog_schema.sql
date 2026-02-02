-- Migration 011: Create syslog schema tables
-- For databases initialized before syslog module was available

-- Create syslog schema if not exists
CREATE SCHEMA IF NOT EXISTS syslog;

-- Syslog sources (devices sending syslog)
CREATE TABLE IF NOT EXISTS syslog.sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    port INTEGER DEFAULT 514,
    protocol VARCHAR(10) NOT NULL DEFAULT 'udp' CHECK (protocol IN ('udp', 'tcp', 'tls')),
    hostname VARCHAR(255),
    device_type VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    events_received BIGINT DEFAULT 0,
    last_event_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syslog_sources_ip ON syslog.sources(ip_address);
CREATE INDEX IF NOT EXISTS idx_syslog_sources_active ON syslog.sources(is_active);

-- Syslog events (with 10GB circular buffer - managed by partitioning)
-- Note: Primary key must include partition key (received_at)
CREATE TABLE IF NOT EXISTS syslog.events (
    id UUID DEFAULT uuid_generate_v4(),
    source_id UUID,
    source_ip INET NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- RFC 5424 fields
    facility INTEGER NOT NULL CHECK (facility >= 0 AND facility <= 23),
    severity INTEGER NOT NULL CHECK (severity >= 0 AND severity <= 7),
    version INTEGER DEFAULT 1,
    timestamp TIMESTAMPTZ,
    hostname VARCHAR(255),
    app_name VARCHAR(48),
    proc_id VARCHAR(128),
    msg_id VARCHAR(32),
    structured_data JSONB,
    message TEXT,
    -- Parsed fields
    device_type VARCHAR(100),
    event_type VARCHAR(100),
    tags TEXT[],
    -- Raw message
    raw_message TEXT NOT NULL,
    -- Composite primary key includes partition column
    PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);

-- Create default partition
CREATE TABLE IF NOT EXISTS syslog.events_default PARTITION OF syslog.events DEFAULT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_syslog_events_source ON syslog.events(source_id);
CREATE INDEX IF NOT EXISTS idx_syslog_events_received ON syslog.events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_syslog_events_severity ON syslog.events(severity);
CREATE INDEX IF NOT EXISTS idx_syslog_events_facility ON syslog.events(facility);
CREATE INDEX IF NOT EXISTS idx_syslog_events_source_ip ON syslog.events(source_ip);
CREATE INDEX IF NOT EXISTS idx_syslog_events_hostname ON syslog.events(hostname);
CREATE INDEX IF NOT EXISTS idx_syslog_events_device_type ON syslog.events(device_type);
CREATE INDEX IF NOT EXISTS idx_syslog_events_event_type ON syslog.events(event_type);
CREATE INDEX IF NOT EXISTS idx_syslog_events_tags ON syslog.events USING gin(tags);

-- Syslog filters
CREATE TABLE IF NOT EXISTS syslog.filters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 100,
    criteria JSONB NOT NULL DEFAULT '{}',
    action VARCHAR(20) NOT NULL CHECK (action IN ('alert', 'drop', 'forward', 'tag')),
    action_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    match_count BIGINT DEFAULT 0,
    last_match_at TIMESTAMPTZ,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syslog_filters_active ON syslog.filters(is_active, priority);

-- Syslog forwarders
CREATE TABLE IF NOT EXISTS syslog.forwarders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    target_host VARCHAR(255) NOT NULL,
    target_port INTEGER NOT NULL DEFAULT 514,
    protocol VARCHAR(10) NOT NULL DEFAULT 'tcp' CHECK (protocol IN ('udp', 'tcp', 'tls')),
    tls_enabled BOOLEAN DEFAULT false,
    tls_verify BOOLEAN DEFAULT true,
    tls_ca_cert TEXT,
    tls_client_cert TEXT,
    tls_client_key_encrypted TEXT,
    filter_criteria JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    events_forwarded BIGINT DEFAULT 0,
    last_forward_at TIMESTAMPTZ,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    buffer_size INTEGER DEFAULT 10000,
    retry_count INTEGER DEFAULT 3,
    retry_delay_ms INTEGER DEFAULT 1000,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syslog_forwarders_active ON syslog.forwarders(is_active);

-- Buffer management settings
CREATE TABLE IF NOT EXISTS syslog.buffer_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    max_size_bytes BIGINT NOT NULL DEFAULT 10737418240,
    current_size_bytes BIGINT DEFAULT 0,
    retention_days INTEGER DEFAULT 30,
    cleanup_threshold_percent INTEGER DEFAULT 90,
    last_cleanup_at TIMESTAMPTZ,
    events_dropped_overflow BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default buffer settings
INSERT INTO syslog.buffer_settings (max_size_bytes, retention_days)
VALUES (10737418240, 30)
ON CONFLICT (id) DO NOTHING;

-- Add trigger for sources updated_at (if shared.update_updated_at exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
        DROP TRIGGER IF EXISTS update_syslog_sources_updated_at ON syslog.sources;
        CREATE TRIGGER update_syslog_sources_updated_at
            BEFORE UPDATE ON syslog.sources
            FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();
    END IF;
END $$;
