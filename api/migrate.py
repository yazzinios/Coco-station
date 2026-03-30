import os
import glob
import psycopg2

# Inline SQL — guaranteed to run regardless of build context or file paths.
# All statements are IF NOT EXISTS / ON CONFLICT safe — can be re-run anytime.
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

INSERT INTO decks (id, name, volume, is_playing) VALUES
    ('a', 'Castle',  100, false),
    ('b', 'Deck B',  100, false),
    ('c', 'Karting', 100, false),
    ('d', 'Deck D',  100, false)
ON CONFLICT (id) DO NOTHING;

-- Add 'status' column to announcements if it was created without it
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Ready';
"""

def run_migrations_local(db_url: str):
    print(f"[migrate] Connecting to Local DB: {db_url}")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()

    print("[migrate] Applying base schema...")
    cur.execute(BASE_SCHEMA_SQL)
    print("[migrate] Base schema applied.")

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

    print(f"[migrate] Running cloud migrations against {supabase_url}...")

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    # Ensure base schema (includes status column + ALTER TABLE guard)
    _run_sql_supabase(supabase_url, supabase_key, BASE_SCHEMA_SQL)

    try:
        r = httpx.get(
            f"{supabase_url}/rest/v1/_migrations?select=name",
            headers=headers,
            timeout=10,
        )
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
            _run_sql_supabase(supabase_url, supabase_key, sql)
            _run_sql_supabase(supabase_url, supabase_key,
                f"INSERT INTO _migrations (name) VALUES ('{filename}') ON CONFLICT DO NOTHING;")
            print(f"[migrate] Cloud migration {filename} applied.")
            ran += 1

    print(f"[migrate] Done. {ran} new migration(s) applied.")
    return ran


def _run_sql_supabase(supabase_url: str, supabase_key: str, sql: str):
    import httpx

    response = httpx.post(
        f"{supabase_url}/rest/v1/rpc/exec_sql",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
        },
        json={"sql": sql},
        timeout=15,
    )
    if response.status_code == 404:
        response = httpx.post(
            f"{supabase_url}/pg/query",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
            },
            json={"query": sql},
            timeout=15,
        )
    return response


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
            print("[migrate] Cloud mode but SUPABASE_URL/SUPABASE_SERVICE_KEY not set — skipping.")


if __name__ == "__main__":
    run_migrations()
