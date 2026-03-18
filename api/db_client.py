import os
import json
import uuid
from datetime import datetime
from typing import List, Dict, Optional

DB_MODE = os.getenv("DB_MODE", "local").lower()

class DBClient:
    def __init__(self):
        self.mode = DB_MODE
        self.conn = None
        
        if self.mode == "cloud":
            try:
                from supabase import create_client, Client
                url = os.getenv("SUPABASE_URL")
                key = os.getenv("SUPABASE_SERVICE_KEY")
                if not url or not key:
                    print("SUPABASE_URL and SUPABASE_SERVICE_KEY required for cloud mode.")
                else:
                    self.supabase: Client = create_client(url, key)
            except ImportError:
                print("supabase-py not installed. Run `pip install supabase`.")
        else:
            # Local Mode uses psycopg2
            user = os.getenv("POSTGRES_USER", "coco")
            password = os.getenv("POSTGRES_PASSWORD", "coco_secret")
            host = os.getenv("POSTGRES_HOST", "db")
            dbname = os.getenv("POSTGRES_DB", "cocostation")
            self.db_url = f"postgresql://{user}:{password}@{host}:5432/{dbname}"

    def _get_conn(self):
        import psycopg2
        from psycopg2.extras import RealDictCursor
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(self.db_url, cursor_factory=RealDictCursor)
            self.conn.autocommit = True
        return self.conn

    # ── Announcements ──
    def get_announcements(self) -> List[Dict]:
        if self.mode == "cloud":
            res = self.supabase.table("announcements").select("*").order("created_at", desc=True).execute()
            # Map DB columns to App keys
            for row in res.data:
                if "file_path" in row: row["filename"] = row.pop("file_path")
                if "schedule_at" in row: row["scheduled_at"] = row.pop("schedule_at")
                if isinstance(row.get("targets"), str):
                    row["targets"] = json.loads(row["targets"])
                if isinstance(row.get("created_at"), datetime):
                    row["created_at"] = row["created_at"].isoformat()
            return res.data
        else:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM announcements ORDER BY created_at DESC")
                rows = cur.fetchall()
                results = []
                for row in rows:
                    r = dict(row)
                    if "file_path" in r: r["filename"] = r.pop("file_path")
                    if "schedule_at" in r: r["scheduled_at"] = r.pop("schedule_at")
                    if isinstance(r.get("created_at"), datetime):
                        r["created_at"] = r["created_at"].isoformat()
                    if isinstance(r.get("scheduled_at"), datetime):
                        r["scheduled_at"] = r["scheduled_at"].isoformat()
                    if isinstance(r.get("targets"), str):
                        r["targets"] = json.loads(r["targets"])
                    results.append(r)
                return results

    def create_announcement(self, ann: Dict):
        # ann matches columns: name, text, type, file_path, targets, schedule_at
        data = {
            "name": ann["name"],
            "text": ann.get("text"),
            "type": ann["type"].lower(),
            "file_path": ann.get("filename"),
            "targets": json.dumps(ann.get("targets", ["ALL"])),
            "schedule_at": ann.get("scheduled_at")
        }
        if self.mode == "cloud":
            self.supabase.table("announcements").insert(data).execute()
        else:
            conn = self._get_conn()
            with conn.cursor() as cur:
                columns = data.keys()
                values = [data[column] for column in columns]
                insert_query = f"INSERT INTO announcements ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(values))})"
                cur.execute(insert_query, values)

    def delete_announcement(self, ann_id: str):
        if self.mode == "cloud":
            self.supabase.table("announcements").delete().eq("id", ann_id).execute()
        else:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute("DELETE FROM announcements WHERE id = %s", (ann_id,))

    def update_announcement_status(self, ann_id: str, status: str):
        # We don't have a status column in the migration yet, but we use it in-memory.
        # Let's see if we should add it or just ignore it for now.
        # The prompt says "announcement library add to database", so persist the existence.
        pass

db = DBClient()
