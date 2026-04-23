-- Migration 009: Chimes/Jingles library table
-- Treats chimes like library tracks: uploaded via API, stored on disk, metadata in DB

CREATE TABLE IF NOT EXISTS chimes (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL UNIQUE,
    size INT DEFAULT 0,
    duration FLOAT,
    type VARCHAR(20) DEFAULT 'jingle',  -- 'intro' | 'outro' | 'jingle'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO _migrations (name) VALUES ('009_chimes_library.sql')
    ON CONFLICT DO NOTHING;
