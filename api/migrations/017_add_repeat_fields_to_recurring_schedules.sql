-- Migration 017: Add repeat_count and repeat_interval to recurring_schedules
-- These fields were defined in the Pydantic schema (RecurringScheduleCreateRequest /
-- RecurringSchedule) and the response model but were never written to or read back
-- from the DB because no migration added the columns and the save function didn't
-- include them.  Both columns default to the same values as the schema defaults so
-- existing rows are unaffected.

ALTER TABLE recurring_schedules
    ADD COLUMN IF NOT EXISTS repeat_count    INTEGER NOT NULL DEFAULT 1;

ALTER TABLE recurring_schedules
    ADD COLUMN IF NOT EXISTS repeat_interval INTEGER NOT NULL DEFAULT 0;
