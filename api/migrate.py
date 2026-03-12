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

    # Create the _migrations table if it doesn't exist.
    # We do a basic check just in case 001 hasn't run.
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
                
            # Execute SQL
            cur.execute(sql)
            
            # Record it
            cur.execute("INSERT INTO _migrations (name) VALUES (%s)", (filename,))
            print(f"Migration {filename} applied successfully.")

    cur.close()
    conn.close()

def run_migrations():
    """Entry point for running all migrations, local or cloud."""
    db_mode = os.getenv("DB_MODE", "local").lower()
    
    if db_mode == "local":
        user = os.getenv("POSTGRES_USER", "coco")
        password = os.getenv("POSTGRES_PASSWORD", "coco_secret")
        host = os.getenv("POSTGRES_HOST", "db")
        db = os.getenv("POSTGRES_DB", "cocostation")
        db_url = f"postgresql://{user}:{password}@{host}:5432/{db}"
        
        # Wait for DB to be ready
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
        print("Cloud DB mode enabled. Assuming Supabase handles its own migrations or you run them manually in SQL Editor.")
        # Alternatively, could use supabase-py to run SQL via RPC if exposed,
        # but standard Supabase workflow is usually manual or via Supabase CLI.

if __name__ == "__main__":
    run_migrations()
