-- Migration: Add sudo/privilege escalation fields to SSH credentials
-- Run this against an existing database to add sudo support

-- Add sudo enabled flag (whether to use sudo after connecting)
ALTER TABLE stig.ssh_credentials ADD COLUMN IF NOT EXISTS sudo_enabled BOOLEAN DEFAULT false;

-- Add sudo method: password (use sudo password), nopasswd (sudoers NOPASSWD), or same_as_ssh (use SSH password)
ALTER TABLE stig.ssh_credentials ADD COLUMN IF NOT EXISTS sudo_method VARCHAR(20) DEFAULT 'password';

-- Add encrypted sudo password (separate from SSH password for security)
ALTER TABLE stig.ssh_credentials ADD COLUMN IF NOT EXISTS sudo_password_encrypted TEXT;

-- Add sudo user to become (default is root)
ALTER TABLE stig.ssh_credentials ADD COLUMN IF NOT EXISTS sudo_user VARCHAR(255) DEFAULT 'root';

COMMENT ON COLUMN stig.ssh_credentials.sudo_enabled IS 'Whether to elevate privileges via sudo after SSH connection';
COMMENT ON COLUMN stig.ssh_credentials.sudo_method IS 'Sudo authentication method: password, nopasswd, same_as_ssh';
COMMENT ON COLUMN stig.ssh_credentials.sudo_password_encrypted IS 'AES-256-GCM encrypted sudo password (if different from SSH)';
COMMENT ON COLUMN stig.ssh_credentials.sudo_user IS 'Target user to become via sudo (default: root)';
