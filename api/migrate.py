import os
import glob
import psycopg2

# Inline SQL -- guaranteed to run regardless of build context or file paths.
# All statements are IF NOT EXISTS / ON CONFLICT safe -- can be re-run anytime.
BASE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decks (
    id VARCHAR(1) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    volume INT DEFAULT 100,
    is_playing BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255),
    duration INT,
    filename VARCHAR(255),
    storage_path VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS queue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id VARCHAR(1) REFERENCES decks(id),
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
    position INT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    text TEXT,
    type VARCHAR(10),
    file_path VARCHAR(255),
    targets JSONB,
    schedule_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'Ready',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Ready';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS lang VARCHAR(10) DEFAULT 'en';

CREATE TABLE IF NOT EXISTS playlists (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tracks JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id VARCHAR(1) REFERENCES decks(id),
    tracks_played INT DEFAULT 0,
    total_airtime INT DEFAULT 0,
    peak_listeners INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chimes (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL UNIQUE,
    size INT DEFAULT 0,
    duration FLOAT,
    type VARCHAR(20) DEFAULT 'jingle',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_branding (
    id           SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL DEFAULT '',
    logo_data    TEXT,
    logo_mime    VARCHAR(50),
    logo_size    INT DEFAULT 0,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO company_branding (id, company_name) VALUES (1, '') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    password_hash TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'operator',
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    allowed_decks  JSONB NOT NULL DEFAULT '["a","b","c","d"]',
    deck_control   JSONB NOT NULL DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}',
    deck_actions   JSONB NOT NULL DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.crossfader","deck.load_track","deck.load_playlist"]',
    playlist_perms JSONB NOT NULL DEFAULT '["playlist.view","playlist.load"]',
    can_announce   BOOLEAN NOT NULL DEFAULT TRUE,
    can_schedule   BOOLEAN NOT NULL DEFAULT TRUE,
    can_library    BOOLEAN NOT NULL DEFAULT TRUE,
    can_requests   BOOLEAN NOT NULL DEFAULT TRUE,
    can_settings   BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- roles: system + custom roles with default permission templates
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    color VARCHAR(20) DEFAULT '#6B7280',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    default_allowed_decks  JSONB NOT NULL DEFAULT '["a","b","c","d"]',
    default_deck_control   JSONB NOT NULL DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}',
    default_deck_actions   JSONB NOT NULL DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.crossfader","deck.load_track","deck.load_playlist"]',
    default_playlist_perms JSONB NOT NULL DEFAULT '["playlist.view","playlist.load"]',
    default_can_announce   BOOLEAN NOT NULL DEFAULT TRUE,
    default_can_schedule   BOOLEAN NOT NULL DEFAULT TRUE,
    default_can_library    BOOLEAN NOT NULL DEFAULT TRUE,
    default_can_requests   BOOLEAN NOT NULL DEFAULT TRUE,
    default_can_settings   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    username    VARCHAR(100) NOT NULL,
    action      VARCHAR(100) NOT NULL,
    details     JSONB,
    ip_address  VARCHAR(50),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_logs_created ON user_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_logs_user    ON user_logs (user_id);

INSERT INTO decks (id, name, volume, is_playing) VALUES
    ('a', 'Castle',  100, false),
    ('b', 'Deck B',  100, false),
    ('c', 'Karting', 100, false),
    ('d', 'Deck D',  100, false)
ON CONFLICT (id) DO NOTHING;
"""


def _seed_roles(cur):
    """Insert the four built-in system roles if they don't already exist."""
    FULL_DECKS         = '["a","b","c","d"]'
    FULL_CTRL          = '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}'
    VIEW_ONLY_CTRL     = '{"a":{"view":true,"control":false},"b":{"view":true,"control":false},"c":{"view":true,"control":false},"d":{"view":true,"control":false}}'
    ALL_ACTIONS        = '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.crossfader","deck.load_track","deck.load_playlist"]'
    ALL_PL_PERMS       = '["playlist.view","playlist.load","playlist.create","playlist.edit","playlist.delete"]'
    OPERATOR_PL_PERMS  = '["playlist.view","playlist.load","playlist.create","playlist.edit"]'

    roles = [
        # (name, display_name, description, color, is_system,
        #  allowed_decks, deck_control, deck_actions, playlist_perms,
        #  can_announce, can_schedule, can_library, can_requests, can_settings)
        (
            'super_admin', 'Super Admin',
            'Full unrestricted access to everything.', '#DC2626', True,
            FULL_DECKS, FULL_CTRL, ALL_ACTIONS, ALL_PL_PERMS,
            True, True, True, True, True
        ),
        (
            'admin', 'Admin',
            'Manage users and content. Cannot change system settings.', '#D97706', True,
            FULL_DECKS, FULL_CTRL, ALL_ACTIONS, ALL_PL_PERMS,
            True, True, True, True, False
        ),
        (
            'operator', 'Operator',
            'Full deck control. Cannot manage users or settings.', '#2563EB', True,
            FULL_DECKS, FULL_CTRL, ALL_ACTIONS, OPERATOR_PL_PERMS,
            True, True, True, True, False
        ),
        (
            'viewer', 'Viewer',
            'Read-only. Can see decks but cannot control anything.', '#6B7280', True,
            FULL_DECKS, VIEW_ONLY_CTRL, '[]', '["playlist.view"]',
            False, False, False, False, False
        ),
    ]
    for r in roles:
        cur.execute("SELECT 1 FROM roles WHERE name = %s", (r[0],))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO roles
                    (name, display_name, description, color, is_system,
                     default_allowed_decks, default_deck_control,
                     default_deck_actions, default_playlist_perms,
                     default_can_announce, default_can_schedule,
                     default_can_library, default_can_requests, default_can_settings)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, r)
    print("[migrate] System roles seeded.")


def _seed_admin(cur):
    """Insert or update default admin user (cocoadmin / Coco@coco)."""
    try:
        import bcrypt
        pw_hash = bcrypt.hashpw(b"Coco@coco", bcrypt.gensalt()).decode()
    except ImportError:
        pw_hash = "__NEEDS_BCRYPT__"
        print("[migrate] WARNING: bcrypt not available -- admin password not set. Rebuild container.")

    cur.execute(
        """
        INSERT INTO users (username, display_name, password_hash, role, is_super_admin, enabled)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (username) DO UPDATE SET
            is_super_admin = TRUE,
            password_hash = CASE
                WHEN users.password_hash = '__NEEDS_BCRYPT__' THEN EXCLUDED.password_hash
                ELSE users.password_hash
            END
        """,
        ("cocoadmin", "Coco Admin", pw_hash, "super_admin", True, True),
    )
    print("[migrate] Super-admin user 'cocoadmin' ensured.")


def run_migrations_local(db_url: str):
    print(f"[migrate] Connecting to Local DB: {db_url}")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()

    print("[migrate] Applying base schema...")
    cur.execute(BASE_SCHEMA_SQL)
    print("[migrate] Base schema applied.")

    # (Moved seeding to after schema repair to avoid missing column errors)

    # Schema Repair -- safe ALTER TABLE patches for existing deployments
    REPAIR_SQL = """
    DO $$
    BEGIN
        -- Fix recurring_mixer_schedules
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recurring_mixer_schedules') THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_mixer_schedules' AND column_name = 'stop_time') THEN
                ALTER TABLE recurring_mixer_schedules DROP COLUMN stop_time;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_mixer_schedules' AND column_name = 'deck_ids') THEN
                ALTER TABLE recurring_mixer_schedules ADD COLUMN deck_ids JSONB DEFAULT '[]';
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_mixer_schedules' AND column_name = 'deck_id') THEN
                    UPDATE recurring_mixer_schedules SET deck_ids = jsonb_build_array(deck_id);
                END IF;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_mixer_schedules' AND column_name = 'multi_tracks') THEN
                ALTER TABLE recurring_mixer_schedules ADD COLUMN multi_tracks JSONB DEFAULT '[]';
            END IF;
        END IF;

        -- Fix recurring_schedules
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recurring_schedules') THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_schedules' AND column_name = 'stop_time') THEN
                ALTER TABLE recurring_schedules DROP COLUMN stop_time;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_schedules' AND column_name = 'excluded_days') THEN
                ALTER TABLE recurring_schedules ADD COLUMN excluded_days TEXT NOT NULL DEFAULT '[]';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_schedules' AND column_name = 'jingle_start') THEN
                ALTER TABLE recurring_schedules ADD COLUMN jingle_start TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_schedules' AND column_name = 'jingle_end') THEN
                ALTER TABLE recurring_schedules ADD COLUMN jingle_end TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_schedules' AND column_name = 'target_decks') THEN
                ALTER TABLE recurring_schedules ADD COLUMN target_decks TEXT NOT NULL DEFAULT '[]';
            END IF;
        END IF;

        -- Ensure users table has all required columns
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'display_name') THEN
                ALTER TABLE users ADD COLUMN display_name VARCHAR(255);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_super_admin') THEN
                ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'enabled') THEN
                ALTER TABLE users ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE;
            END IF;
            -- Widen role column from VARCHAR(20) to VARCHAR(50) for custom roles
            ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50);
        END IF;

        -- Create user_permissions if missing (legacy deployments)
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_permissions') THEN
            CREATE TABLE user_permissions (
                user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                allowed_decks  JSONB NOT NULL DEFAULT '["a","b","c","d"]',
                deck_control   JSONB NOT NULL DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}',
                deck_actions   JSONB NOT NULL DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.load_track","deck.load_playlist"]',
                playlist_perms JSONB NOT NULL DEFAULT '["playlist.view","playlist.load"]',
                can_announce   BOOLEAN NOT NULL DEFAULT TRUE,
                can_schedule   BOOLEAN NOT NULL DEFAULT TRUE,
                can_library    BOOLEAN NOT NULL DEFAULT TRUE,
                can_requests   BOOLEAN NOT NULL DEFAULT TRUE,
                can_settings   BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        END IF;

        -- Add granular permission columns to existing user_permissions tables
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_permissions') THEN
            ALTER TABLE user_permissions
                ADD COLUMN IF NOT EXISTS deck_control JSONB
                    DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}',
                ADD COLUMN IF NOT EXISTS deck_actions JSONB
                    DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.crossfader","deck.load_track","deck.load_playlist"]',
                ADD COLUMN IF NOT EXISTS playlist_perms JSONB
                    DEFAULT '["playlist.view","playlist.load"]';
        END IF;

        -- Create user_logs if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_logs') THEN
            CREATE TABLE user_logs (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id     TEXT NOT NULL,
                username    VARCHAR(100) NOT NULL,
                action      VARCHAR(100) NOT NULL,
                details     JSONB,
                ip_address  VARCHAR(50),
                created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX idx_user_logs_created ON user_logs (created_at DESC);
            CREATE INDEX idx_user_logs_user    ON user_logs (user_id);
        END IF;

        -- Create roles table if missing (legacy deployments)
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles') THEN
            CREATE TABLE roles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(50) UNIQUE NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                description TEXT DEFAULT '',
                color VARCHAR(20) DEFAULT '#6B7280',
                is_system BOOLEAN NOT NULL DEFAULT FALSE,
                default_allowed_decks  JSONB NOT NULL DEFAULT '["a","b","c","d"]',
                default_deck_control   JSONB NOT NULL DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}',
                default_deck_actions   JSONB NOT NULL DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.crossfader","deck.load_track","deck.load_playlist"]',
                default_playlist_perms JSONB NOT NULL DEFAULT '["playlist.view","playlist.load"]',
                default_can_announce   BOOLEAN NOT NULL DEFAULT TRUE,
                default_can_schedule   BOOLEAN NOT NULL DEFAULT TRUE,
                default_can_library    BOOLEAN NOT NULL DEFAULT TRUE,
                default_can_requests   BOOLEAN NOT NULL DEFAULT TRUE,
                default_can_settings   BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        END IF;

        -- Add missing columns to roles if rolling back from newer schema
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'display_name') THEN
                ALTER TABLE roles ADD COLUMN display_name VARCHAR(100) NOT NULL DEFAULT 'Role';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'description') THEN
                ALTER TABLE roles ADD COLUMN description TEXT DEFAULT '';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'color') THEN
                ALTER TABLE roles ADD COLUMN color VARCHAR(20) DEFAULT '#6B7280';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'is_system') THEN
                ALTER TABLE roles ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_allowed_decks') THEN
                ALTER TABLE roles ADD COLUMN default_allowed_decks JSONB NOT NULL DEFAULT '["a","b","c","d"]';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_deck_control') THEN
                ALTER TABLE roles ADD COLUMN default_deck_control JSONB NOT NULL DEFAULT '{"a":{"view":true,"control":true},"b":{"view":true,"control":true},"c":{"view":true,"control":true},"d":{"view":true,"control":true}}';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_deck_actions') THEN
                ALTER TABLE roles ADD COLUMN default_deck_actions JSONB NOT NULL DEFAULT '["deck.play","deck.pause","deck.stop","deck.next","deck.previous","deck.volume","deck.crossfader","deck.load_track","deck.load_playlist"]';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_playlist_perms') THEN
                ALTER TABLE roles ADD COLUMN default_playlist_perms JSONB NOT NULL DEFAULT '["playlist.view","playlist.load"]';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_can_announce') THEN
                ALTER TABLE roles ADD COLUMN default_can_announce BOOLEAN NOT NULL DEFAULT TRUE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_can_schedule') THEN
                ALTER TABLE roles ADD COLUMN default_can_schedule BOOLEAN NOT NULL DEFAULT TRUE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_can_library') THEN
                ALTER TABLE roles ADD COLUMN default_can_library BOOLEAN NOT NULL DEFAULT TRUE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_can_requests') THEN
                ALTER TABLE roles ADD COLUMN default_can_requests BOOLEAN NOT NULL DEFAULT TRUE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'default_can_settings') THEN
                ALTER TABLE roles ADD COLUMN default_can_settings BOOLEAN NOT NULL DEFAULT FALSE;
            END IF;
        END IF;
    END $$;
    """
    print("[migrate] Patching schema inconsistencies...")
    cur.execute(REPAIR_SQL)

    # Re-seed roles after repair (idempotent)
    _seed_roles(cur)

    # Seed default admin user after repair
    _seed_admin(cur)

    cur.execute("SELECT name FROM _migrations")
    applied = set(row[0] for row in cur.fetchall())

    migration_files = sorted(
        glob.glob("/app/migrations/*.sql") +
        glob.glob("/app/supabase/migrations/*.sql")
    )

    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename not in applied:
            print(f"[migrate] Applying migration file: {filename}...")
            with open(filepath, "r") as f:
                sql = f.read()
            try:
                cur.execute(sql)
                cur.execute("INSERT INTO _migrations (name) VALUES (%s)", (filename,))
                print(f"[migrate] {filename} applied.")
            except Exception as e:
                print(f"[migrate] {filename} skipped/failed: {e}")

    cur.close()
    conn.close()


def run_migrations_cloud(supabase_url: str, supabase_key: str):
    import httpx
    import re

    print(f"[migrate] Running cloud migrations against {supabase_url}...")
    match = re.search(r"https://([^.]+)\.supabase\.co", supabase_url)
    project_ref = match.group(1) if match else None
    mgmt_headers = {"Authorization": f"Bearer {supabase_key}", "Content-Type": "application/json"}

    def run_sql(sql: str) -> bool:
        if project_ref:
            try:
                r = httpx.post(
                    f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
                    headers=mgmt_headers, json={"query": sql}, timeout=30,
                )
                if r.status_code < 300: return True
                print(f"[migrate] Management API {r.status_code}: {r.text[:200]}")
            except Exception as e:
                print(f"[migrate] Management API error: {e}")
        try:
            r = httpx.post(
                f"{supabase_url}/rest/v1/rpc/exec_sql",
                headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}",
                         "Content-Type": "application/json"},
                json={"sql": sql}, timeout=15,
            )
            if r.status_code < 300: return True
            print(f"[migrate] exec_sql RPC {r.status_code}: {r.text[:200]}")
        except Exception as e:
            print(f"[migrate] exec_sql RPC error: {e}")
        return False

    run_sql(BASE_SCHEMA_SQL)

    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}",
               "Content-Type": "application/json", "Prefer": "return=representation"}
    try:
        r = httpx.get(f"{supabase_url}/rest/v1/_migrations?select=name", headers=headers, timeout=10)
        applied = set(row["name"] for row in r.json()) if r.status_code == 200 else set()
    except Exception:
        applied = set()

    migration_files = sorted(glob.glob("/app/supabase/migrations/*.sql"))
    ran = 0
    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename not in applied:
            print(f"[migrate] Applying cloud migration: {filename}...")
            with open(filepath, "r") as f:
                sql = f.read()
            if run_sql(sql):
                run_sql(f"INSERT INTO _migrations (name) VALUES ('{filename}') ON CONFLICT DO NOTHING;")
                print(f"[migrate] Cloud migration {filename} applied.")
                ran += 1

    print(f"[migrate] Done. {ran} new migration(s) applied.")
    return ran


def run_migrations():
    db_mode = os.getenv("DB_MODE", "local").lower()

    if db_mode == "local":
        user     = os.getenv("POSTGRES_USER",     "coco")
        password = os.getenv("POSTGRES_PASSWORD", "coco_secret")
        host     = os.getenv("POSTGRES_HOST",     "db")
        db       = os.getenv("POSTGRES_DB",       "cocostation")
        db_url   = f"postgresql://{user}:{password}@{host}:5432/{db}"

        import time
        max_retries = 10
        for i in range(max_retries):
            try:
                run_migrations_local(db_url)
                print("[migrate] All local migrations applied.")
                break
            except psycopg2.OperationalError as e:
                print(f"[migrate] DB not ready, retrying in 2s ({i+1}/{max_retries})... {e}")
                time.sleep(2)
        else:
            print("[migrate] Failed to connect to Local DB after all retries.")
    else:
        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if supabase_url and supabase_key:
            try:
                run_migrations_cloud(supabase_url, supabase_key)
            except Exception as e:
                print(f"[migrate] Cloud migration failed: {e}")
        else:
            print("[migrate] Cloud mode but SUPABASE_URL/SUPABASE_SERVICE_KEY not set -- skipping.")


if __name__ == "__main__":
    run_migrations()
