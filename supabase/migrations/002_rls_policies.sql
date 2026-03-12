-- Row Level Security policies (Only runs if Supabase auth exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
        
        -- Enable RLS on all tables
        ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
        ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
        ALTER TABLE queue_items ENABLE ROW LEVEL SECURITY;
        ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
        ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
        ALTER TABLE stats ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

        -- Create helper function
        CREATE OR REPLACE FUNCTION public.is_admin()
        RETURNS BOOLEAN AS $func$
        BEGIN
          RETURN EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
          );
        END;
        $func$ LANGUAGE plpgsql SECURITY DEFINER;

        -- Decks: anyone can read, DJs/Admins can update
        CREATE POLICY "Allow public read decks" ON decks FOR SELECT USING (true);
        CREATE POLICY "Allow auth update decks" ON decks FOR UPDATE USING (auth.role() = 'authenticated');

        -- Tracks: anyone can read, Admin can insert/update/delete
        CREATE POLICY "Allow public read tracks" ON tracks FOR SELECT USING (true);
        CREATE POLICY "Allow admin all tracks" ON tracks USING (public.is_admin());

        -- Queue: anyone can read, auth can all
        CREATE POLICY "Allow public read queue" ON queue_items FOR SELECT USING (true);
        CREATE POLICY "Allow auth all queue" ON queue_items USING (auth.role() = 'authenticated');

        -- Settings: public can read, admin can update
        CREATE POLICY "Allow public read settings" ON settings FOR SELECT USING (true);
        CREATE POLICY "Allow admin update settings" ON settings FOR ALL USING (public.is_admin());

        -- Profiles: users can read their own, admins can read all
        CREATE POLICY "Allow user read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
        CREATE POLICY "Allow admin read all profiles" ON public.profiles FOR SELECT USING (public.is_admin());
        CREATE POLICY "Allow admin edit profiles" ON public.profiles FOR ALL USING (public.is_admin());

    END IF;
END $$;
