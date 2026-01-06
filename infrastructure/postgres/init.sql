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

-- Set search path
ALTER DATABASE netnynja SET search_path TO shared, ipam, npm, stig, public;

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

-- Monitored devices
CREATE TABLE npm.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    device_type VARCHAR(100),
    vendor VARCHAR(100),
    model VARCHAR(100),
    snmp_community_encrypted TEXT,
    snmp_version VARCHAR(10) DEFAULT 'v2c',
    ssh_enabled BOOLEAN DEFAULT false,
    poll_interval INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT true,
    last_poll TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'unknown',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_npm_devices_ip ON npm.devices(ip_address);
CREATE INDEX idx_npm_devices_status ON npm.devices(status);

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
    xccdf_content JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TRIGGER update_stig_targets_updated_at
    BEFORE UPDATE ON stig.targets
    FOR EACH ROW EXECUTE FUNCTION shared.update_updated_at();

-- ============================================
-- SEED DATA (Development Only)
-- ============================================

-- Default admin user (password: admin - CHANGE IN PRODUCTION)
-- Argon2id hash of 'admin'
INSERT INTO shared.users (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@netnynja.local',
    '$argon2id$v=19$m=65536,t=3,p=4$CHANGE_THIS_HASH_IN_PRODUCTION',
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

COMMENT ON SCHEMA shared IS 'Cross-application shared tables: users, auth, audit';
COMMENT ON SCHEMA ipam IS 'IP Address Management module tables';
COMMENT ON SCHEMA npm IS 'Network Performance Monitoring module tables';
COMMENT ON SCHEMA stig IS 'STIG Manager compliance module tables';
