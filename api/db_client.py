import os

DB_MODE = os.getenv("DB_MODE", "local").lower()

class DBClient:
    def __init__(self):
        self.mode = DB_MODE
        
        if self.mode == "cloud":
            try:
                from supabase import create_client, Client
                url = os.getenv("SUPABASE_URL")
                key = os.getenv("SUPABASE_SERVICE_KEY")
                if not url or not key:
                    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY required in cloud mode.")
                self.supabase: Client = create_client(url, key)
            except ImportError:
                print("supabase-py not installed. Run `pip install supabase`.")
        else:
            # Local Mode placeholder logic. In reality we'd configure SQLAlchemy or asyncpg here.
            import psycopg2
            self.conn = None # Set up in the main app
            
    def get_tracks(self):
        if self.mode == "cloud":
            return self.supabase.table("tracks").select("*").execute()
        else:
            # Implement local query
            pass

db = DBClient()
