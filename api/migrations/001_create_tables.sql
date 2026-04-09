-- Create _migrations table to track what has run
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Decks
CREATE TABLE IF NOT EXISTS decks (
    id VARCHAR(1) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    volume INT DEFAULT 100,
    is_playing BOOLEAN DEFAULT false
);

-- Tracks Library
CREATE TABLE IF NOT EXISTS tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255),
    duration INT,
    filename VARCHAR(255),
    storage_path VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Queue per deck
CREATE TABLE IF NOT EXISTS queue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id VARCHAR(1) REFERENCES decks(id),
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
    position INT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Playlists
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tracks JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    text TEXT,
    lang VARCHAR(10) DEFAULT 'en',
    type VARCHAR(10),
    file_path VARCHAR(255),
    targets JSONB DEFAULT '["ALL"]',
    schedule_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'Ready',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Key-value settings
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL
);

-- Music Schedules
CREATE TABLE IF NOT EXISTS music_schedules (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    deck_id VARCHAR(1) REFERENCES decks(id),
    type VARCHAR(20) NOT NULL,
    target_id TEXT NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    loop BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'Scheduled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recurring Schedules (Mic/Announcements)
CREATE TABLE IF NOT EXISTS recurring_schedules (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL,
    announcement_id TEXT REFERENCES announcements(id) ON DELETE SET NULL,
    start_time VARCHAR(5) NOT NULL,
    active_days JSONB DEFAULT '[]',
    excluded_days JSONB DEFAULT '[]',
    fade_duration INT DEFAULT 5,
    music_volume INT DEFAULT 10,
    target_decks JSONB DEFAULT '["A"]',
    jingle_start VARCHAR(255),
    jingle_end VARCHAR(255),
    enabled BOOLEAN DEFAULT true,
    last_run_date VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recurring Mixer Schedules (Music/Deck)
CREATE TABLE IF NOT EXISTS recurring_mixer_schedules (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL,
    target_id TEXT NOT NULL,
    deck_ids JSONB DEFAULT '[]',
    start_time VARCHAR(5) NOT NULL,
    active_days JSONB DEFAULT '[]',
    excluded_days JSONB DEFAULT '[]',
    fade_in INT DEFAULT 3,
    fade_out INT DEFAULT 3,
    volume INT DEFAULT 80,
    loop BOOLEAN DEFAULT true,
    jingle_start VARCHAR(255),
    jingle_end VARCHAR(255),
    multi_tracks JSONB DEFAULT '[]',
    enabled BOOLEAN DEFAULT true,
    last_run_date VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Statistics
CREATE TABLE IF NOT EXISTS stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id VARCHAR(1) REFERENCES decks(id),
    tracks_played INT DEFAULT 0,
    total_airtime INT DEFAULT 0,
    peak_listeners INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Profiles (only if Supabase auth schema exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
        CREATE TABLE IF NOT EXISTS public.profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            role VARCHAR(50) DEFAULT 'dj',
            display_name VARCHAR(255)
        );
    END IF;
END $$;
