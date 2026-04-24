-- Migration 010: Company branding table
-- Stores the company logo as a base64 data-URI so it survives volume wipes.

CREATE TABLE IF NOT EXISTS company_branding (
    id           SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL DEFAULT '',
    logo_data    TEXT,          -- full base64 data-URI  e.g. "data:image/png;base64,..."
    logo_mime    VARCHAR(50),   -- e.g. "image/png"
    logo_size    INT DEFAULT 0, -- original file size in bytes
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure exactly one row always exists
INSERT INTO company_branding (id, company_name) VALUES (1, '')
    ON CONFLICT (id) DO NOTHING;

INSERT INTO _migrations (name) VALUES ('010_company_branding.sql')
    ON CONFLICT DO NOTHING;
