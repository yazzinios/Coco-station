-- ═══════════════════════════════════════════════════════════════
--  Migration 012 — Patch roles table for post-rollback deployments
--  Safely adds any columns that may be missing from the roles table
--  due to the roles table being created by an older schema version.
--  All statements are idempotent and safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- Create roles table from scratch if it somehow doesn't exist
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    color VARCHAR(20) DEFAULT '#6B7280',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    default_allowed_decks  JSONB NOT NULL DEFAULT '["a","b","c","d"]',
    default_deck_control   JSONB NOT NULL DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}',
    default_deck_actions   JSONB NOT NULL DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.crossfader","deck.load_track","deck.load_playlist"]',
    default_playlist_perms JSONB NOT NULL DEFAULT '["playlist.view","playlist.load"]',
    default_can_announce   BOOLEAN NOT NULL DEFAULT TRUE,
    default_can_schedule   BOOLEAN NOT NULL DEFAULT TRUE,
    default_can_library    BOOLEAN NOT NULL DEFAULT TRUE,
    default_can_requests   BOOLEAN NOT NULL DEFAULT TRUE,
    default_can_settings   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Patch any missing columns on an already-existing roles table
ALTER TABLE roles ADD COLUMN IF NOT EXISTS display_name           VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS description            TEXT DEFAULT '';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS color                  VARCHAR(20) DEFAULT '#6B7280';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system              BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_allowed_decks  JSONB NOT NULL DEFAULT '["a","b","c","d"]';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_deck_control   JSONB NOT NULL DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_deck_actions   JSONB NOT NULL DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.crossfader","deck.load_track","deck.load_playlist"]';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_playlist_perms JSONB NOT NULL DEFAULT '["playlist.view","playlist.load"]';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_can_announce   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_can_schedule   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_can_library    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_can_requests   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_can_settings   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
