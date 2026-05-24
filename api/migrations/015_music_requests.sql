-- Migration 015: Music Requests persistence
-- FIX (Bug 9): music requests were in-memory only and lost on restart.

CREATE TABLE IF NOT EXISTS music_requests (
    id              TEXT PRIMARY KEY,
    requester_name  TEXT NOT NULL,
    requester_email TEXT,
    requester_phone TEXT,
    requester_photo TEXT,
    track           TEXT NOT NULL,
    message         TEXT,
    target_deck     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_requests_status  ON music_requests(status);
CREATE INDEX IF NOT EXISTS idx_music_requests_created ON music_requests(created_at DESC);
