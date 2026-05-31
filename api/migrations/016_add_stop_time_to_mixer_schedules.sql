-- Migration 016: Re-add stop_time to recurring_mixer_schedules
-- Migration 007 dropped this column, but the application code uses it for
-- auto-stopping scheduled music at a configured time. Adding it back as
-- a nullable TEXT column so existing rows are unaffected.

ALTER TABLE recurring_mixer_schedules
    ADD COLUMN IF NOT EXISTS stop_time TEXT DEFAULT NULL;
