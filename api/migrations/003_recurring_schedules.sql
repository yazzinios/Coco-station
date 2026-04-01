CREATE TABLE IF NOT EXISTS recurring_schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    announcement_id TEXT,
    start_time TEXT NOT NULL,
    -- stop_time removed: announcement/mic runs until it ends naturally
    active_days TEXT NOT NULL DEFAULT '[]',
    excluded_days TEXT NOT NULL DEFAULT '[]',
    fade_duration INTEGER DEFAULT 5,
    music_volume INTEGER DEFAULT 10,
    target_decks TEXT NOT NULL DEFAULT '[]',
    jingle_start TEXT,
    jingle_end TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    last_run_date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to existing tables if upgrading
ALTER TABLE recurring_schedules ADD COLUMN IF NOT EXISTS excluded_days TEXT NOT NULL DEFAULT '[]';
ALTER TABLE recurring_schedules ADD COLUMN IF NOT EXISTS jingle_start TEXT;
ALTER TABLE recurring_schedules ADD COLUMN IF NOT EXISTS jingle_end TEXT;
-- Drop stop_time if it still exists (safe: ignored if column doesn't exist)
DO $ BEGIN
    ALTER TABLE recurring_schedules DROP COLUMN IF EXISTS stop_time;
EXCEPTION WHEN undefined_column THEN NULL;
END $;
