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

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    text TEXT,
    type VARCHAR(10),
    file_path VARCHAR(255),
    targets JSONB,
    schedule_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Key-value settings
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL
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
DO $
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
        CREATE TABLE IF NOT EXISTS public.profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            role VARCHAR(50) DEFAULT 'dj',
            display_name VARCHAR(255)
        );
    END IF;
END $;
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

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    text TEXT,
    type VARCHAR(10),
    file_path VARCHAR(255),
    targets JSONB,
    schedule_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Key-value settings
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL
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
