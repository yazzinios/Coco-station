-- Migration 006: fix deck_ids column and clear stale last_run_date
-- Runs safely even if columns already exist (IF NOT EXISTS guards).

-- 1. Add deck_ids column if the table was created with the old deck_id schema
ALTER TABLE recurring_mixer_schedules ADD COLUMN IF NOT EXISTS deck_ids TEXT DEFAULT '["a"]';

-- 2. Populate deck_ids from deck_id for rows that still have the old column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recurring_mixer_schedules'
          AND column_name = 'deck_id'
    ) THEN
        UPDATE recurring_mixer_schedules
            SET deck_ids = '["' || deck_id || '"]'
            WHERE deck_id IS NOT NULL
              AND (deck_ids = '["a"]' OR deck_ids IS NULL);

        ALTER TABLE recurring_mixer_schedules DROP COLUMN IF EXISTS deck_id;
    END IF;
END $$;

-- 3. Clear stale last_run_date so every schedule can fire again today
UPDATE recurring_mixer_schedules SET last_run_date = NULL;
UPDATE recurring_schedules         SET last_run_date = NULL;

-- 4. Add missing columns to announcements (safe on re-run)
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'en';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS text TEXT;
