CREATE TABLE IF NOT EXISTS recurring_mixer_schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'track',
    target_id TEXT NOT NULL,
    deck_ids TEXT NOT NULL DEFAULT '["a"]',  -- JSON array, replaces old deck_id
    start_time TEXT NOT NULL,
    -- stop_time removed: music plays until track/playlist ends naturally
    active_days TEXT NOT NULL DEFAULT '[]',
    excluded_days TEXT NOT NULL DEFAULT '[]',
    fade_in INTEGER DEFAULT 3,
    fade_out INTEGER DEFAULT 3,
    volume INTEGER DEFAULT 80,
    loop BOOLEAN DEFAULT TRUE,
    jingle_start TEXT,
    jingle_end TEXT,
    multi_tracks TEXT DEFAULT '[]',
    enabled BOOLEAN DEFAULT TRUE,
    last_run_date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Drop stop_time if upgrading from an older schema
DO $ BEGIN
    ALTER TABLE recurring_mixer_schedules DROP COLUMN IF EXISTS stop_time;
EXCEPTION WHEN undefined_column THEN NULL;
END $;

-- Migrate deck_id (TEXT) -> deck_ids (TEXT JSON array) for existing databases
DO $ BEGIN
    ALTER TABLE recurring_mixer_schedules ADD COLUMN IF NOT EXISTS deck_ids TEXT DEFAULT '["a"]';
    UPDATE recurring_mixer_schedules
        SET deck_ids = '["' || deck_id || '"]'
        WHERE deck_id IS NOT NULL
          AND (deck_ids = '["a"]' OR deck_ids IS NULL);
    ALTER TABLE recurring_mixer_schedules DROP COLUMN IF EXISTS deck_id;
EXCEPTION WHEN others THEN NULL;
END $;
