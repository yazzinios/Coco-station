CREATE TABLE IF NOT EXISTS recurring_schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,         -- 'announcement', 'microphone'
    announcement_id TEXT,       -- references announcements.id
    start_time TEXT NOT NULL,    -- "HH:MM"
    stop_time TEXT NOT NULL,     -- "HH:MM"
    active_days TEXT NOT NULL,   -- JSON array [0,1,2,3,4,5,6]
    fade_duration INTEGER DEFAULT 5,
    music_volume INTEGER DEFAULT 10,
    target_decks TEXT NOT NULL,  -- JSON array ["a", "b"]
    enabled BOOLEAN DEFAULT TRUE,
    last_run_date TEXT,          -- "YYYY-MM-DD"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
