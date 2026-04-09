-- Migration 007: Cleanup stop_time column and constraint
-- This migration explicitly handles the case where stop_time was left over with a NOT NULL constraint.

DO $$ 
BEGIN
    -- Cleanup recurring_mixer_schedules
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recurring_mixer_schedules' AND column_name = 'stop_time'
    ) THEN
        ALTER TABLE recurring_mixer_schedules DROP COLUMN stop_time;
    END IF;

    -- Cleanup recurring_schedules (just in case)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recurring_schedules' AND column_name = 'stop_time'
    ) THEN
        ALTER TABLE recurring_schedules DROP COLUMN stop_time;
    END IF;
END $$;
