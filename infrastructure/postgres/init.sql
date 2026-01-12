-- NetNynja Enterprise - PostgreSQL Initialization
-- Creates separate schemas for each application module

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";  -- Case-insensitive text

-- ============================================
-- SCHEMAS
-- ============================================

CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS ipam;
CREATE SCHEMA IF NOT EXISTS npm;
CREATE SCHEMA IF NOT EXISTS stig;
CREATE SCHEMA IF NOT EXISTS syslog;

-- Set search path
ALTER DATABASE netnynja SET search_path TO shared, ipam, npm, stig, syslog, public;

-- ============================================
-- SHARED SCHEMA - Cross-application tables
-- ============================================

-- Users table (unified authentication)
CREATE TABLE shared.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username CITEXT UNIQUE NOT NULL,
    email CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh tokens for JWT
CREATE TABLE shared.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES shared.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user ON shared.refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON shared.refresh_tokens(expires_at);

-- Audit log (all applications)
CREATE TABLE shared.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES shared.users(id),
    action VARCHAR(100) NOT NULL,
    module VARCHAR(50) NOT NULL CHECK (module IN ('ipam', 'npm', 'stig', 'auth', 'system')),
    resource_type VARCHAR(100),
    resource_id TEXT,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON shared.audit_log(user_id);
CREATE INDEX idx_audit_log_module ON shared.audit_log(module);
CREATE INDEX idx_audit_log_created ON shared.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_resource ON shared.audit_log(resource_type, resource_id);

-- System settings
CREATE TABLE shared.settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES shared.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- IPAM SCHEMA
-- ============================================

-- Networks/Subnets
CREATE TABLE ipam.networks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    network CIDR NOT NULL,
    vlan_id INTEGER,
    description TEXT,
    location VARCHAR(255),
    site VARCHAR(255),
    gateway INET,
    dns_servers INET[],
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_networks_cidr ON ipam.networks USING gist (network inet_ops);

-- IP Addresses
CREATE TABLE ipam.addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    network_id UUID REFERENCES ipam.networks(id) ON DELETE CASCADE,
    address INET NOT NULL,
    mac_address MACADDR,
    hostname VARCHAR(255),
    fqdn VARCHAR(512),
    status VARCHAR(50) DEFAULT 'unknown' CHECK (status IN ('active', 'inactive', 'reserved', 'dhcp', 'unknown')),
    device_type VARCHAR(100),
    description TEXT,
    last_seen TIMESTAMPTZ,
    discovered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(network_id, address)
);

CREATE INDEX idx_addresses_ip ON ipam.addresses(address);
CREATE INDEX idx_addresses_mac ON ipam.addresses(mac_address);
CREATE INDEX idx_addresses_status ON ipam.addresses(status);

-- Scan history
CREATE TABLE ipam.scan_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    network_id UUID REFERENCES ipam.networks(id) ON DELETE CASCADE,
    scan_type VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    notes TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    total_ips INTEGER,
    active_ips INTEGER,
    new_ips INTEGER,
    status VARCHAR(50) DEFAULT 'running',
    error_message TEXT
);

CREATE INDEX idx_scan_history_network ON ipam.scan_history(network_id);
CREATE INDEX idx_scan_history_started ON ipam.scan_history(started_at DESC);

-- ============================================
-- NPM SCHEMA
-- ============================================

-- SNMPv3 Credentials (reusable across devices)
CREATE TABLE npm.snmpv3_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- SNMPv3 USM parameters
    username VARCHAR(255) NOT NULL,
    security_level VARCHAR(20) NOT NULL DEFAULT 'authPriv'
        CHECK (security_level IN ('noAuthNoPriv', 'authNoPriv', 'authPriv')),
    -- Authentication (FIPS-compliant algorithms only)
    auth_protocol VARCHAR(20) CHECK (auth_protocol IN ('SHA', 'SHA-224', 'SHA-256', 'SHA-384', 'SHA-512')),
    auth_password_encrypted TEXT,
    -- Privacy (FIPS-compliant algorithms only - AES variants)
    priv_protocol VARCHAR(20) CHECK (priv_protocol IN ('AES', 'AES-192', 'AES-256')),
    priv_password_encrypted TEXT,
    -- Context
    context_name VARCHAR(255),
    context_engine_id VARCHAR(255),
    -- Metadata
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snmpv3_credentials_name ON npm.snmpv3_credentials(name);

-- Monitored devices
CREATE TABLE npm.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    device_type VARCHAR(100),
    vendor VARCHAR(100),
    model VARCHAR(100),
    -- Device grouping
    group_id UUID,
    -- Polling methods (can be ICMP, SNMPv3, or both)
    poll_icmp BOOLEAN DEFAULT true,
    poll_snmp BOOLEAN DEFAULT false,
    snmpv3_credential_id UUID REFERENCES npm.snmpv3_credentials(id) ON DELETE SET NULL,
    snmp_port INTEGER DEFAULT 161,
    ssh_enabled BOOLEAN DEFAULT false,
    poll_interval INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT true,
    last_poll TIMESTAMPTZ,
    last_icmp_poll TIMESTAMPTZ,
    last_snmp_poll TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'unknown',
    icmp_status VARCHAR(50) DEFAULT 'unknown',
    snmp_status VARCHAR(50) DEFAULT 'unknown',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Ensure at least one polling method is enabled
    CONSTRAINT device_polling_method CHECK (poll_icmp = true OR poll_snmp = true)
);

CREATE INDEX idx_npm_devices_ip ON npm.devices(ip_address);
CREATE INDEX idx_npm_devices_status ON npm.devices(status);
CREATE INDEX idx_npm_devices_credential ON npm.devices(snmpv3_credential_id);
CREATE INDEX idx_npm_devices_group ON npm.devices(group_id);

-- Interfaces
CREATE TABLE npm.interfaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES npm.devices(id) ON DELETE CASCADE,
    if_index INTEGER NOT NULL,
    name VARCHAR(255),
    description TEXT,
    mac_address MACADDR,
    ip_addresses INET[],
    speed_mbps BIGINT,
    admin_status VARCHAR(50),
    oper_status VARCHAR(50),
    is_monitored BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, if_index)
);

CREATE INDEX idx_interfaces_device ON npm.interfaces(device_id);

-- Device Groups (for organizing devices)
CREATE TABLE npm.device_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6366f1' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    parent_id UUID REFERENCES npm.device_groups(id) ON DELETE SET NULL,
    device_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name)
);

CREATE INDEX idx_device_groups_parent ON npm.device_groups(parent_id);
CREATE INDEX idx_device_groups_active ON npm.device_groups(is_active);

-- Volumes/Storage (for monitoring disk/storage on devices)
CREATE TABLE npm.volumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES npm.devices(id) ON DELETE CASCADE,
    volume_index INTEGER NOT NULL,
    name VARCHAR(255),
    description TEXT,
    type VARCHAR(50) CHECK (type IN ('hrStorageFixedDisk', 'hrStorageRemovableDisk', 'hrStorageFlashMemory', 'hrStorageNetworkDisk', 'hrStorageRam', 'hrStorageVirtualMemory', 'hrStorageOther')),
    mount_point VARCHAR(512),
    total_bytes BIGINT,
    used_bytes BIGINT,
    is_monitored BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, volume_index)
);

CREATE INDEX idx_volumes_device ON npm.volumes(device_id);

-- Alert rules
CREATE TABLE npm.alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_type VARCHAR(100) NOT NULL,
    condition VARCHAR(50) NOT NULL,
    threshold NUMERIC NOT NULL,
    duration_seconds INTEGER DEFAULT 60,
    severity VARCHAR(50) DEFAULT 'warning',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts
CREATE TABLE npm.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID REFERENCES npm.alert_rules(id),
    device_id UUID REFERENCES npm.devices(id),
    interface_id UUID REFERENCES npm.interfaces(id),
    message TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    triggered_at TIMESTAMPTZ NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES shared.users(id),
    resolved_at TIMESTAMPTZ,
    details JSONB
);

CREATE INDEX idx_alerts_device ON npm.alerts(device_id);
CREATE INDEX idx_alerts_status ON npm.alerts(status);
CREATE INDEX idx_alerts_triggered ON npm.alerts(triggered_at DESC);

-- Discovery Jobs (network scanning for device discovery)
CREATE TABLE npm.discovery_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cidr CIDR NOT NULL,
    discovery_method VARCHAR(50) NOT NULL CHECK (discovery_method IN ('icmp', 'snmpv3', 'both')),
    snmpv3_credential_id UUID REFERENCES npm.snmpv3_credentials(id),
    site VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    total_hosts INTEGER DEFAULT 0,
    discovered_hosts INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discovery_jobs_status ON npm.discovery_jobs(status);
CREATE INDEX idx_discovery_jobs_created ON npm.discovery_jobs(created_at DESC);

-- Discovered Hosts (temporary storage before adding to devices)
CREATE TABLE npm.discovered_hosts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES npm.discovery_jobs(id) ON DELETE CASCADE,
    ip_address INET NOT NULL,
    hostname VARCHAR(255),
    mac_address MACADDR,
    vendor VARCHAR(255),
    model VARCHAR(255),
    device_type VARCHAR(100),
    os_family VARCHAR(100),
    sys_name VARCHAR(255),
    sys_description TEXT,
    sys_contact VARCHAR(255),
    sys_location VARCHAR(255),
    site VARCHAR(255),
    icmp_reachable BOOLEAN DEFAULT false,
    icmp_latency_ms NUMERIC(10, 3),
    icmp_ttl INTEGER,
    snmp_reachable BOOLEAN DEFAULT false,
    snmp_engine_id VARCHAR(255),
    interfaces_count INTEGER DEFAULT 0,
    uptime_seconds BIGINT,
    open_ports TEXT,
    fingerprint_confidence VARCHAR(20) DEFAULT 'low' CHECK (fingerprint_confidence IN ('low', 'medium', 'high')),
    is_added_to_monitoring BOOLEAN DEFAULT false,
    device_id UUID REFERENCES npm.devices(id),
    discovered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discovered_hosts_job ON npm.discovered_hosts(job_id);
CREATE INDEX idx_discovered_hosts_ip ON npm.discovered_hosts(ip_address);
CREATE INDEX idx_discovered_hosts_added ON npm.discovered_hosts(is_added_to_monitoring);
CREATE INDEX idx_discovered_hosts_site ON npm.discovered_hosts(site);

-- Device Metrics (time-series storage for CPU, memory, latency, availability)
-- Partitioned by timestamp for efficient querying and retention management
CREATE TABLE npm.device_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    is_available BOOLEAN DEFAULT false
) PARTITION BY RANGE (collected_at);

-- Create partitions for metrics (daily partitions)
-- In production, use pg_partman for automatic partition management
CREATE TABLE npm.device_metrics_default PARTITION OF npm.device_metrics DEFAULT;

CREATE INDEX idx_device_metrics_device ON npm.device_metrics(device_id);
CREATE INDEX idx_device_metrics_collected ON npm.device_metrics(collected_at DESC);
CREATE INDEX idx_device_metrics_device_time ON npm.device_metrics(device_id, collected_at DESC);

-- Interface Metrics (bandwidth utilization, errors)
CREATE TABLE npm.interface_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    utilization_in_percent NUMERIC(5, 2),
    utilization_out_percent NUMERIC(5, 2),
    -- Status
    admin_status VARCHAR(20),
    oper_status VARCHAR(20)
) PARTITION BY RANGE (collected_at);

CREATE TABLE npm.interface_metrics_default PARTITION OF npm.interface_metrics DEFAULT;

CREATE INDEX idx_interface_metrics_interface ON npm.interface_metrics(interface_id);
CREATE INDEX idx_interface_metrics_device ON npm.interface_metrics(device_id);
CREATE INDEX idx_interface_metrics_collected ON npm.interface_metrics(collected_at DESC);
CREATE INDEX idx_interface_metrics_if_time ON npm.interface_metrics(interface_id, collected_at DESC);

-- Volume Metrics (storage utilization)
CREATE TABLE npm.volume_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    volume_id UUID REFERENCES npm.volumes(id) ON DELETE CASCADE,
    device_id UUID REFERENCES npm.devices(id) ON DELETE CASCADE,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Storage utilization
    total_bytes BIGINT,
    used_bytes BIGINT,
    available_bytes BIGINT,
    utilization_percent NUMERIC(5, 2)
) PARTITION BY RANGE (collected_at);

CREATE TABLE npm.volume_metrics_default PARTITION OF npm.volume_metrics DEFAULT;

CREATE INDEX idx_volume_metrics_volume ON npm.volume_metrics(volume_id);
CREATE INDEX idx_volume_metrics_device ON npm.volume_metrics(device_id);
CREATE INDEX idx_volume_metrics_collected ON npm.volume_metrics(collected_at DESC);
CREATE INDEX idx_volume_metrics_vol_time ON npm.volume_metrics(volume_id, collected_at DESC);

-- Aggregated device availability (hourly/daily summaries)
CREATE TABLE npm.device_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES npm.devices(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('hourly', 'daily', 'weekly', 'monthly')),
    -- Availability metrics
    total_polls INTEGER NOT NULL DEFAULT 0,
    successful_polls INTEGER NOT NULL DEFAULT 0,
    failed_polls INTEGER NOT NULL DEFAULT 0,
    availability_percent NUMERIC(5, 2),
    -- Latency aggregates
    avg_latency_ms NUMERIC(10, 3),
    min_latency_ms NUMERIC(10, 3),
    max_latency_ms NUMERIC(10, 3),
    -- Resource utilization aggregates
    avg_cpu_percent NUMERIC(5, 2),
    max_cpu_percent NUMERIC(5, 2),
    avg_memory_percent NUMERIC(5, 2),
    max_memory_percent NUMERIC(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, period_start, period_type)
);

CREATE INDEX idx_device_availability_device ON npm.device_availability(device_id);
CREATE INDEX idx_device_availability_period ON npm.device_availability(period_start DESC);
CREATE INDEX idx_device_availability_type ON npm.device_availability(period_type);

-- ============================================
-- STIG SCHEMA
-- ============================================

-- Target devices for STIG audits
CREATE TABLE stig.targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    platform VARCHAR(100) NOT NULL,
    os_version VARCHAR(100),
    connection_type VARCHAR(50) NOT NULL CHECK (connection_type IN ('ssh', 'netmiko', 'winrm', 'api')),
    credential_id VARCHAR(255),  -- Reference to Vault secret
    port INTEGER,
    is_active BOOLEAN DEFAULT true,
    last_audit TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stig_targets_ip ON stig.targets(ip_address);
CREATE INDEX idx_stig_targets_platform ON stig.targets(platform);

-- STIG definitions
CREATE TABLE stig.definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stig_id VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(512) NOT NULL,
    version VARCHAR(50),
    release_date DATE,
    platform VARCHAR(100),
    description TEXT,
    xccdf_content TEXT,  -- Store raw XCCDF XML
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- STIG definition rules (individual checks from XCCDF)
CREATE TABLE stig.definition_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    definition_id UUID NOT NULL REFERENCES stig.definitions(id) ON DELETE CASCADE,
    rule_id VARCHAR(100) NOT NULL,
    title VARCHAR(512),
    severity VARCHAR(50) CHECK (severity IN ('high', 'medium', 'low')),
    description TEXT,
    fix_text TEXT,
    check_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(definition_id, rule_id)
);

CREATE INDEX idx_definition_rules_definition ON stig.definition_rules(definition_id);
CREATE INDEX idx_definition_rules_severity ON stig.definition_rules(severity);

-- Audit jobs
CREATE TABLE stig.audit_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    target_id UUID REFERENCES stig.targets(id),
    definition_id UUID REFERENCES stig.definitions(id),
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    error_message TEXT
);

CREATE INDEX idx_audit_jobs_target ON stig.audit_jobs(target_id);
CREATE INDEX idx_audit_jobs_status ON stig.audit_jobs(status);
CREATE INDEX idx_audit_jobs_created ON stig.audit_jobs(created_at DESC);

-- Audit results
CREATE TABLE stig.audit_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES stig.audit_jobs(id) ON DELETE CASCADE,
    rule_id VARCHAR(100) NOT NULL,
    title VARCHAR(512),
    severity VARCHAR(50),
    status VARCHAR(50) NOT NULL CHECK (status IN ('pass', 'fail', 'not_applicable', 'not_reviewed', 'error')),
    finding_details TEXT,
    comments TEXT,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_results_job ON stig.audit_results(job_id);
CREATE INDEX idx_audit_results_status ON stig.audit_results(status);
CREATE INDEX idx_audit_results_severity ON stig.audit_results(severity);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION shared.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON shared.users
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_networks_updated_at
    BEFORE UPDATE ON ipam.networks
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_addresses_updated_at
    BEFORE UPDATE ON ipam.addresses
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_npm_devices_updated_at
    BEFORE UPDATE ON npm.devices
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_snmpv3_credentials_updated_at
    BEFORE UPDATE ON npm.snmpv3_credentials
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_stig_targets_updated_at
    BEFORE UPDATE ON stig.targets
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_discovery_jobs_updated_at
    BEFORE UPDATE ON npm.discovery_jobs
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_device_groups_updated_at
    BEFORE UPDATE ON npm.device_groups
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

-- Function to update device_count in device_groups when devices change groups
CREATE OR REPLACE FUNCTION npm.update_device_group_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Decrement old group count
    IF OLD.group_id IS NOT NULL THEN
        UPDATE npm.device_groups SET device_count = device_count - 1 WHERE id = OLD.group_id;
    END IF;
    -- Increment new group count
    IF NEW.group_id IS NOT NULL THEN
        UPDATE npm.device_groups SET device_count = device_count + 1 WHERE id = NEW.group_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION npm.device_group_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.group_id IS NOT NULL THEN
        UPDATE npm.device_groups SET device_count = device_count + 1 WHERE id = NEW.group_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION npm.device_group_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.group_id IS NOT NULL THEN
        UPDATE npm.device_groups SET device_count = device_count - 1 WHERE id = OLD.group_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_device_group_count_on_update
    AFTER UPDATE OF group_id ON npm.devices
    FOR EACH ROW
    WHEN (OLD.group_id IS DISTINCT FROM NEW.group_id)
    EXECUTE FUNCTION npm.update_device_group_count();

CREATE TRIGGER update_device_group_count_on_insert
    AFTER INSERT ON npm.devices
    FOR EACH ROW EXECUTE FUNCTION npm.device_group_insert();

CREATE TRIGGER update_device_group_count_on_delete
    AFTER DELETE ON npm.devices
    FOR EACH ROW EXECUTE FUNCTION npm.device_group_delete();

-- ============================================
-- SEED DATA (Development Only)
-- ============================================

-- Default admin user (password: adminadmin - CHANGE IN PRODUCTION)
-- Argon2id hash of 'adminadmin'
INSERT INTO shared.users (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@netnynja.local',
    '$argon2id$v=19$m=65536,t=3,p=4$RQdT9l4Tz2PIt+0pF2DlcA$/uRbwmrYDTQg+MiqsohbLZRy+dbu/WZUThM/v3sG2jw',
    'admin'
) ON CONFLICT (username) DO NOTHING;

-- ============================================
-- GRANTS
-- ============================================

-- Application role (create in production with proper credentials)
-- CREATE ROLE netnynja_app WITH LOGIN PASSWORD 'CHANGE_ME';
-- GRANT USAGE ON SCHEMA shared, ipam, npm, stig TO netnynja_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shared, ipam, npm, stig TO netnynja_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA shared, ipam, npm, stig TO netnynja_app;

-- ============================================
-- SYSLOG SCHEMA
-- ============================================

-- Syslog sources (devices sending syslog)
CREATE TABLE syslog.sources (
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

CREATE INDEX idx_syslog_sources_ip ON syslog.sources(ip_address);
CREATE INDEX idx_syslog_sources_active ON syslog.sources(is_active);

-- Syslog events (with 10GB circular buffer - managed by partitioning)
-- Events are partitioned by received_at for efficient buffer management
CREATE TABLE syslog.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID REFERENCES syslog.sources(id) ON DELETE SET NULL,
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
    raw_message TEXT NOT NULL
) PARTITION BY RANGE (received_at);

-- Create partitions for the last 7 days and next day
-- Note: In production, use pg_partman for automatic partition management
CREATE TABLE syslog.events_default PARTITION OF syslog.events DEFAULT;

CREATE INDEX idx_syslog_events_source ON syslog.events(source_id);
CREATE INDEX idx_syslog_events_received ON syslog.events(received_at DESC);
CREATE INDEX idx_syslog_events_severity ON syslog.events(severity);
CREATE INDEX idx_syslog_events_facility ON syslog.events(facility);
CREATE INDEX idx_syslog_events_source_ip ON syslog.events(source_ip);
CREATE INDEX idx_syslog_events_hostname ON syslog.events(hostname);
CREATE INDEX idx_syslog_events_device_type ON syslog.events(device_type);
CREATE INDEX idx_syslog_events_event_type ON syslog.events(event_type);
CREATE INDEX idx_syslog_events_tags ON syslog.events USING gin(tags);

-- Syslog filters (for routing, alerting, dropping)
CREATE TABLE syslog.filters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 100,
    -- Filter criteria (JSONB for flexibility)
    criteria JSONB NOT NULL DEFAULT '{}',
    -- Actions: alert, drop, forward, tag
    action VARCHAR(20) NOT NULL CHECK (action IN ('alert', 'drop', 'forward', 'tag')),
    action_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    match_count BIGINT DEFAULT 0,
    last_match_at TIMESTAMPTZ,
    created_by UUID REFERENCES shared.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_syslog_filters_active ON syslog.filters(is_active, priority);

-- Syslog forwarders (for off-loading to external systems)
CREATE TABLE syslog.forwarders (
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

CREATE INDEX idx_syslog_forwarders_active ON syslog.forwarders(is_active);

-- Buffer management settings
CREATE TABLE syslog.buffer_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton
    max_size_bytes BIGINT NOT NULL DEFAULT 10737418240, -- 10GB default
    current_size_bytes BIGINT DEFAULT 0,
    retention_days INTEGER DEFAULT 30,
    cleanup_threshold_percent INTEGER DEFAULT 90,
    last_cleanup_at TIMESTAMPTZ,
    events_dropped_overflow BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default buffer settings
INSERT INTO syslog.buffer_settings (max_size_bytes, retention_days)
VALUES (10737418240, 30) -- 10GB, 30 days
ON CONFLICT (id) DO NOTHING;

-- Triggers for syslog tables
CREATE TRIGGER update_syslog_sources_updated_at
    BEFORE UPDATE ON syslog.sources
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_syslog_filters_updated_at
    BEFORE UPDATE ON syslog.filters
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

CREATE TRIGGER update_syslog_forwarders_updated_at
    BEFORE UPDATE ON syslog.forwarders
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

COMMENT ON SCHEMA shared IS 'Cross-application shared tables: users, auth, audit';
COMMENT ON SCHEMA ipam IS 'IP Address Management module tables';
COMMENT ON SCHEMA npm IS 'Network Performance Monitoring module tables';
COMMENT ON SCHEMA stig IS 'STIG Manager compliance module tables';
COMMENT ON SCHEMA syslog IS 'Syslog collection and forwarding module tables';
