import os
import glob
import psycopg2

def run_migrations_local(db_url: str):
    """
    Runs SQL migrations against local PostgreSQL.
    """
    print(f"Connecting to Local DB: {db_url}")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute('''
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    cur.execute("SELECT name FROM _migrations")
    applied = set(row[0] for row in cur.fetchall())

    migration_files = sorted(glob.glob("/app/supabase/migrations/*.sql"))

    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename not in applied:
            print(f"Applying migration: {filename}...")
            with open(filepath, "r") as f:
                sql = f.read()
            cur.execute(sql)
            cur.execute("INSERT INTO _migrations (name) VALUES (%s)", (filename,))
            print(f"Migration {filename} applied successfully.")

    cur.close()
    conn.close()


def run_migrations_cloud(supabase_url: str, supabase_key: str):
    """
    Runs SQL migrations against Supabase via the REST API (pg endpoint).
    Uses the service_role key to execute raw SQL through Supabase's SQL endpoint.
    """
    import httpx

    print(f"Running cloud migrations against {supabase_url}...")

    # Fetch already-applied migrations via Supabase REST
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    # Create _migrations table first via SQL endpoint
    create_table_sql = """
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    """
    _run_sql_supabase(supabase_url, supabase_key, create_table_sql)

    # Get applied migrations
    try:
        r = httpx.get(
            f"{supabase_url}/rest/v1/_migrations?select=name",
            headers=headers,
            timeout=10,
        )
        if r.status_code == 200:
            applied = set(row["name"] for row in r.json())
        else:
            applied = set()
    except Exception:
        applied = set()

    # Run each pending migration file
    migration_files = sorted(glob.glob("/app/supabase/migrations/*.sql"))
    ran = 0
    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename not in applied:
            print(f"Applying cloud migration: {filename}...")
            with open(filepath, "r") as f:
                sql = f.read()
            _run_sql_supabase(supabase_url, supabase_key, sql)
            # Record it
            record_sql = f"INSERT INTO _migrations (name) VALUES ('{filename}') ON CONFLICT DO NOTHING;"
            _run_sql_supabase(supabase_url, supabase_key, record_sql)
            print(f"Cloud migration {filename} applied.")
            ran += 1

    print(f"Cloud migrations done. {ran} new migration(s) applied.")
    return ran


def _run_sql_supabase(supabase_url: str, supabase_key: str, sql: str):
    """Execute raw SQL against Supabase using the /rest/v1/rpc or SQL endpoint."""
    import httpx

    # Supabase exposes a SQL execution endpoint for service_role
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
    # If RPC not available, fall back to the pg direct endpoint
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
    """Entry point for running all migrations, local or cloud."""
    db_mode = os.getenv("DB_MODE", "local").lower()

    if db_mode == "local":
        user = os.getenv("POSTGRES_USER", "coco")
        password = os.getenv("POSTGRES_PASSWORD", "coco_secret")
        host = os.getenv("POSTGRES_HOST", "db")
        db = os.getenv("POSTGRES_DB", "cocostation")
        db_url = f"postgresql://{user}:{password}@{host}:5432/{db}"

        import time
        max_retries = 10
        for i in range(max_retries):
            try:
                run_migrations_local(db_url)
                print("All local migrations applied.")
                break
            except psycopg2.OperationalError as e:
                print(f"DB not ready yet, retrying in 2s ({i+1}/{max_retries})...")
                time.sleep(2)
        else:
            print("Failed to connect to Local DB.")
    else:
        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if supabase_url and supabase_key:
            try:
                run_migrations_cloud(supabase_url, supabase_key)
            except Exception as e:
                print(f"Cloud migration failed: {e}")
        else:
            print("Cloud mode but SUPABASE_URL/SUPABASE_SERVICE_KEY not set — skipping migrations.")


if __name__ == "__main__":
    run_migrations()
