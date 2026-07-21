-- ═══════════════════════════════════════════════════════════════
--  Migration 019 — Clean users table & simplify LDAP auth
--
--  Changes:
--    • Delete all users EXCEPT the system super-admin (cocoadmin).
--    • Delete all user_permissions rows for deleted users.
--    • Truncate ldap_group_role_map (group-based role resolution removed).
--    • Truncate ldap_user_mappings (legacy per-user overrides removed).
--    • Add is_super_admin protection index comment.
--
--  Safe to re-run: uses DELETE WHERE, not TRUNCATE, to keep cocoadmin safe.
-- ═══════════════════════════════════════════════════════════════

-- 1. Remove all user_permissions for non-super-admin users
DELETE FROM user_permissions
WHERE user_id IN (
    SELECT id FROM users
    WHERE is_super_admin IS NOT TRUE
      AND role != 'super_admin'
);

-- 2. Remove all non-super-admin users
DELETE FROM users
WHERE is_super_admin IS NOT TRUE
  AND role != 'super_admin';

-- 3. Clear LDAP group-to-role mapping table (group-based auth removed)
DELETE FROM ldap_group_role_map;

-- 4. Clear legacy per-user LDAP mappings table
DELETE FROM ldap_user_mappings;

-- 5. Ensure the LDAP users default column exists (viewer role default)
--    When sync_ldap_user inserts new rows it now uses 'viewer' as the role.
--    This comment documents the contract; no schema change needed.
-- New LDAP users will be inserted with: role = 'viewer', enabled = TRUE

-- 6. Ensure ldap_groups_hash column exists (for change detection)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ldap_groups_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ldap_dn TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_overrides JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 7. Backfill source for existing local users
UPDATE users SET source = 'local' WHERE source IS NULL OR source = '';

-- 8. Create unique index on (username, source) if not already present
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_source ON users (username, source);
CREATE INDEX IF NOT EXISTS idx_users_source ON users (source);
