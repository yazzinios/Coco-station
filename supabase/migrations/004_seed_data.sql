-- Seed Default Decks
INSERT INTO decks (id, name, volume, is_playing) VALUES 
('a', 'Deck A (Castle)', 100, false),
('b', 'Deck B', 100, false),
('c', 'Deck C (Karting)', 100, false),
('d', 'Deck D', 100, false)
ON CONFLICT (id) DO NOTHING;

-- Seed Default Settings
INSERT INTO settings (key, value) VALUES 
('fade_percent', '5'::jsonb),
('on_air_beep', '"default"'::jsonb),
('tts_engine', '"gtts"'::jsonb)
ON CONFLICT (key) DO NOTHING;
