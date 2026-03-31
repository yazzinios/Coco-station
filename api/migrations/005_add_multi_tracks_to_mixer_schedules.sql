-- Add multi_tracks column to recurring_mixer_schedules
ALTER TABLE recurring_mixer_schedules ADD COLUMN multi_tracks TEXT DEFAULT '[]';
