CREATE TABLE IF NOT EXISTS recurring_mixer_schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'track',
    target_id TEXT NOT NULL,
    deck_id TEXT NOT NULL,
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
