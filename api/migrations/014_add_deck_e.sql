-- 014_add_deck_e.sql
-- Ensures Deck E has a persisted name row in deck_names.
-- Safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING).

INSERT INTO deck_names (deck_id, name)
VALUES ('e', 'Deck E')
ON CONFLICT (deck_id) DO NOTHING;
