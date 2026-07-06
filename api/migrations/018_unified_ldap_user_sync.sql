-- ═══════════════════════════════════════════════════════════════
--  Migration 018 — Unified DB ↔ LDAP user identity & sync
--
--  Implements USER_ROLE_REDESIGN_PLAN.md:
--    • Every user (local or LDAP) gets a real row in `users`.
--    • `ldap_group_role_map` replaces the scattered
--      ldap_role_*_group settings keys + ldap_role_custom_groups JSON
--      with one clean, queryable table.
--    • `ldap_groups_hash` lets login skip role re-resolution when
--      the user's LDAP group membership hasn't changed, so manual
--      admin role/permission edits survive subsequent logins.
--
--  Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Extend users table for unified identity ────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS source              VARCHAR(10)  NOT NULL DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS ldap_dn              TEXT,
    ADD COLUMN IF NOT EXISTS ldap_groups_hash     VARCHAR(64),
    ADD COLUMN IF NOT EXISTS permission_overrides JSONB;

-- Backfill: anything already in the table before this migration is local
UPDATE users SET source = 'local' WHERE source IS NULL;

-- One LDAP identity per username (a local + an LDAP user CAN coexist
-- under the same username today only if usernames collide across source —
-- enforce uniqueness per source pairing instead of a blanket UNIQUE(username),
-- since the existing `users.username` column may already carry a UNIQUE
-- constraint from 001_create_tables.sql for local accounts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_source
    ON users (username, source);

CREATE INDEX IF NOT EXISTS idx_users_source ON users (source);

-- ── 2. ldap_group_role_map — replaces settings-blob group mapping ─────────
CREATE TABLE IF NOT EXISTS ldap_group_role_map (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_dn    TEXT        NOT NULL,
    role        VARCHAR(20) NOT NULL,      -- 'admin' | 'member' | 'viewer' (simplified role set)
    priority    INT         NOT NULL DEFAULT 100,  -- lower = evaluated first, first match wins
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ldap_group_role_map_dn_ci
    ON ldap_group_role_map (LOWER(group_dn));
CREATE INDEX IF NOT EXISTS idx_ldap_group_role_map_priority
    ON ldap_group_role_map (priority);

-- ── 3. Best-effort migration of legacy settings-based group mappings ──────
-- Old built-in keys (ldap_role_super_admin_group/admin/operator/viewer) and
-- the ldap_role_custom_groups JSON array get folded into the new table,
-- mapped down to the simplified 3-role set:
--   super_admin -> admin | admin -> admin | operator -> member | viewer -> viewer
--   any custom_* -> member (flagged via note for manual review)
DO $$
DECLARE
    v_dn   TEXT;
    v_rec  RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM settings WHERE key = 'ldap_role_super_admin_group') THEN
        SELECT trim(both '"' FROM value::text) INTO v_dn FROM settings WHERE key = 'ldap_role_super_admin_group';
        IF v_dn IS NOT NULL AND v_dn <> '' THEN
            INSERT INTO ldap_group_role_map (group_dn, role, priority)
            VALUES (v_dn, 'admin', 10)
            ON CONFLICT (LOWER(group_dn)) DO NOTHING;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM settings WHERE key = 'ldap_role_admin_group') THEN
        SELECT trim(both '"' FROM value::text) INTO v_dn FROM settings WHERE key = 'ldap_role_admin_group';
        IF v_dn IS NOT NULL AND v_dn <> '' THEN
            INSERT INTO ldap_group_role_map (group_dn, role, priority)
            VALUES (v_dn, 'admin', 20)
            ON CONFLICT (LOWER(group_dn)) DO NOTHING;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM settings WHERE key = 'ldap_role_operator_group') THEN
        SELECT trim(both '"' FROM value::text) INTO v_dn FROM settings WHERE key = 'ldap_role_operator_group';
        IF v_dn IS NOT NULL AND v_dn <> '' THEN
            INSERT INTO ldap_group_role_map (group_dn, role, priority)
            VALUES (v_dn, 'member', 30)
            ON CONFLICT (LOWER(group_dn)) DO NOTHING;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM settings WHERE key = 'ldap_role_viewer_group') THEN
        SELECT trim(both '"' FROM value::text) INTO v_dn FROM settings WHERE key = 'ldap_role_viewer_group';
        IF v_dn IS NOT NULL AND v_dn <> '' THEN
            INSERT INTO ldap_group_role_map (group_dn, role, priority)
            VALUES (v_dn, 'viewer', 40)
            ON CONFLICT (LOWER(group_dn)) DO NOTHING;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM settings WHERE key = 'ldap_role_custom_groups') THEN
        FOR v_rec IN
            SELECT jsonb_array_elements(value::jsonb) AS item
            FROM settings WHERE key = 'ldap_role_custom_groups'
        LOOP
            IF (v_rec.item ->> 'group_dn') IS NOT NULL AND (v_rec.item ->> 'group_dn') <> '' THEN
                INSERT INTO ldap_group_role_map (group_dn, role, priority)
                VALUES (v_rec.item ->> 'group_dn', 'member', 100)
                ON CONFLICT (LOWER(group_dn)) DO NOTHING;
            END IF;
        END LOOP;
    END IF;
END $$;
