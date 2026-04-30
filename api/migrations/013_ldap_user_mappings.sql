-- ═══════════════════════════════════════════════════════════════
--  Migration 013 — LDAP per-user role override mappings
--
--  Creates ldap_user_mappings if it doesn't already exist,
--  and seeds the four LDAP role-group setting keys into the
--  settings table (idempotent — ON CONFLICT DO NOTHING).
--
--  Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ldap_user_mappings (
    ldap_username  VARCHAR(255) PRIMARY KEY,
    role           VARCHAR(50)  NOT NULL DEFAULT 'operator',
    note           TEXT         DEFAULT '',
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. Index (speeds up bulk list queries) ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ldap_user_mappings_role
    ON ldap_user_mappings (role);

-- ── 3. LDAP role-group setting keys ──────────────────────────────────────────
--  These are read by auth_routes.py when resolving a user's role from LDAP
--  group membership.  Each key stores the DN of the group that maps to that
--  built-in role.  ldap_role_custom_groups is a JSON array of
--  {"group": "<DN>", "role": "<role_name>"} objects.
INSERT INTO settings (key, value) VALUES
    ('ldap_role_super_admin_group', '""'),
    ('ldap_role_admin_group',       '""'),
    ('ldap_role_operator_group',    '""'),
    ('ldap_role_viewer_group',      '""'),
    ('ldap_role_custom_groups',     '[]')
ON CONFLICT (key) DO NOTHING;
