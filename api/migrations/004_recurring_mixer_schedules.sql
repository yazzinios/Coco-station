CREATE TABLE IF NOT EXISTS recurring_mixer_schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'track',   -- 'track' | 'playlist'
    target_id TEXT NOT NULL,              -- filename or playlist UUID
    deck_id TEXT NOT NULL,                -- 'a' | 'b' | 'c' | 'd'
    start_time TEXT NOT NULL,             -- "HH:MM"
    stop_time TEXT NOT NULL,              -- "HH:MM"
    active_days TEXT NOT NULL,            -- JSON array e.g. [0,1,2,3,4,5,6]
    excluded_days TEXT DEFAULT '[]',      -- JSON array of "YYYY-MM-DD" strings
    fade_in INTEGER DEFAULT 3,
    fade_out INTEGER DEFAULT 3,
    volume INTEGER DEFAULT 80,
    loop BOOLEAN DEFAULT TRUE,
    jingle_start TEXT,                    -- library filename or NULL
    jingle_end TEXT,                      -- library filename or NULL
    enabled BOOLEAN DEFAULT TRUE,
    last_run_date TEXT,                   -- "YYYY-MM-DD" of most recent trigger
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
