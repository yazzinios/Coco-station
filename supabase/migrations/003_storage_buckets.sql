-- Supabase Storage Buckets (Only runs if storage schema exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
        
        -- Tracks Bucket
        INSERT INTO storage.buckets (id, name, public) VALUES ('tracks', 'tracks', false)
        ON CONFLICT (id) DO NOTHING;

        -- Beeps Bucket
        INSERT INTO storage.buckets (id, name, public) VALUES ('beeps', 'beeps', false)
        ON CONFLICT (id) DO NOTHING;

        -- Backgrounds Bucket
        INSERT INTO storage.buckets (id, name, public) VALUES ('backgrounds', 'backgrounds', true)
        ON CONFLICT (id) DO NOTHING;

        -- Policies for buckets (Simplified: Admins can do everything, authenticated users can read tracks/beeps)
        -- Note: Actual policy setup requires `storage.policies` configuration which depends on exact Supabase setup.
        -- We'll manage access server-side (FastAPI using Service Key) to bypass RLS complexity on storage.
        
    END IF;
END $$;
