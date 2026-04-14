-- ═══════════════════════════════════════════════════════════════
--  Migration 008 — Extended Permission System
--  Adds: per-deck view/control, granular deck actions,
--        playlist permissions, and users/management permissions.
-- ═══════════════════════════════════════════════════════════════

-- 1. Extend user_permissions table with new granular columns
ALTER TABLE user_permissions
    ADD COLUMN IF NOT EXISTS deck_control   JSONB DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}',
    ADD COLUMN IF NOT EXISTS deck_actions   JSONB DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.load_track","deck.load_playlist"]',
    ADD COLUMN IF NOT EXISTS playlist_perms JSONB DEFAULT '["playlist.view","playlist.load"]';

-- 2. Back-fill existing rows with sensible defaults
UPDATE user_permissions
SET
    deck_control   = '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}'::jsonb
WHERE deck_control IS NULL;

UPDATE user_permissions
SET
    deck_actions   = '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.load_track","deck.load_playlist"]'::jsonb
WHERE deck_actions IS NULL;

UPDATE user_permissions
SET
    playlist_perms = '["playlist.view","playlist.load"]'::jsonb
WHERE playlist_perms IS NULL;
