-- Migration: 009_add_syslog_forwarders.sql
-- Description: Add syslog.forwarders table if missing (for databases initialized before v0.2.5)
-- Date: 2026-01-16

-- Syslog forwarders (for off-loading to external systems)
-- Uses CREATE TABLE IF NOT EXISTS to be idempotent
CREATE TABLE IF NOT EXISTS syslog.forwarders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- Target configuration
    target_host VARCHAR(255) NOT NULL,
    target_port INTEGER NOT NULL DEFAULT 514,
    protocol VARCHAR(10) NOT NULL DEFAULT 'tcp' CHECK (protocol IN ('udp', 'tcp', 'tls')),
    -- TLS configuration
    tls_enabled BOOLEAN DEFAULT false,
    tls_verify BOOLEAN DEFAULT true,
    tls_ca_cert TEXT,
    tls_client_cert TEXT,
    tls_client_key_encrypted TEXT,
    -- Filtering (which events to forward)
    filter_criteria JSONB DEFAULT '{}',
    -- Status
    is_active BOOLEAN DEFAULT true,
    events_forwarded BIGINT DEFAULT 0,
    last_forward_at TIMESTAMPTZ,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    -- Buffer settings
    buffer_size INTEGER DEFAULT 10000,
    retry_count INTEGER DEFAULT 3,
    retry_delay_ms INTEGER DEFAULT 1000,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_syslog_forwarders_active ON syslog.forwarders(is_active);

-- Add trigger for updated_at if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_syslog_forwarders_updated_at'
    ) THEN
        CREATE TRIGGER update_syslog_forwarders_updated_at
            BEFORE UPDATE ON syslog.forwarders
            FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();
    END IF;
END
$$;
