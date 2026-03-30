-- Music / Playlist scheduled auto-starts
CREATE TABLE IF NOT EXISTS music_schedules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    deck_id     VARCHAR(1)   NOT NULL,
    type        VARCHAR(10)  NOT NULL,      -- 'track' | 'playlist'
    target_id   VARCHAR(255) NOT NULL,      -- filename (track) or playlist UUID
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    loop        BOOLEAN DEFAULT false,
    status      VARCHAR(20)  DEFAULT 'Scheduled', -- 'Scheduled' | 'Played' | 'Cancelled'
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
