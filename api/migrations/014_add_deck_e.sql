-- 014_add_deck_e.sql
-- Creates the deck_names table if it somehow doesn't exist yet (legacy guard),
-- then ensures Deck E has a persisted name row.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING).

DO $migrate$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'deck_names'
    ) THEN
        CREATE TABLE deck_names (
            deck_id VARCHAR(1) PRIMARY KEY,
            name    VARCHAR(255) NOT NULL DEFAULT ''
        );
        INSERT INTO deck_names (deck_id, name) VALUES
            ('a', 'Castle'), ('b', 'Deck B'), ('c', 'Karting'), ('d', 'Deck D')
        ON CONFLICT (deck_id) DO NOTHING;
    END IF;

    -- Always ensure Deck E row exists, whether the table was just created or already existed
    INSERT INTO deck_names (deck_id, name)
    VALUES ('e', 'Deck E')
    ON CONFLICT (deck_id) DO NOTHING;
END $migrate$;
