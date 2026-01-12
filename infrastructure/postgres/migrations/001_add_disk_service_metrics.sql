-- Migration: Add disk, interface traffic, and service status columns to device_metrics
-- Run this against an existing database to add the new columns

-- Add disk/storage metrics columns
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS disk_utilization_percent NUMERIC(5, 2);
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS disk_total_bytes BIGINT;
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS disk_used_bytes BIGINT;
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS swap_utilization_percent NUMERIC(5, 2);
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS swap_total_bytes BIGINT;

-- Add interface traffic summary columns
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS total_in_octets BIGINT;
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS total_out_octets BIGINT;
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS total_in_errors BIGINT;
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS total_out_errors BIGINT;

-- Add service status column (vendor-specific JSON)
ALTER TABLE npm.device_metrics ADD COLUMN IF NOT EXISTS services_status JSONB;

-- Add index for services_status queries
CREATE INDEX IF NOT EXISTS idx_device_metrics_services ON npm.device_metrics USING gin (services_status) WHERE services_status IS NOT NULL;

COMMENT ON COLUMN npm.device_metrics.disk_utilization_percent IS 'Disk usage percentage (0-100)';
COMMENT ON COLUMN npm.device_metrics.disk_total_bytes IS 'Total disk capacity in bytes';
COMMENT ON COLUMN npm.device_metrics.disk_used_bytes IS 'Used disk space in bytes';
COMMENT ON COLUMN npm.device_metrics.swap_utilization_percent IS 'Swap usage percentage (0-100)';
COMMENT ON COLUMN npm.device_metrics.swap_total_bytes IS 'Total swap space in bytes';
COMMENT ON COLUMN npm.device_metrics.total_in_octets IS 'Sum of all interface inbound octets';
COMMENT ON COLUMN npm.device_metrics.total_out_octets IS 'Sum of all interface outbound octets';
COMMENT ON COLUMN npm.device_metrics.total_in_errors IS 'Sum of all interface inbound errors';
COMMENT ON COLUMN npm.device_metrics.total_out_errors IS 'Sum of all interface outbound errors';
COMMENT ON COLUMN npm.device_metrics.services_status IS 'Vendor-specific service status (JSON)';
