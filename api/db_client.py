import os
import json
from datetime import datetime
from typing import List, Dict

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
                    print("[DB] SUPABASE_URL and SUPABASE_SERVICE_KEY required for cloud mode.")
                else:
                    self.supabase: Client = create_client(url, key)
                    print(f"[DB] Connected to Supabase: {url}")
            except ImportError:
                print("[DB] supabase-py not installed. Run `pip install supabase`.")
        else:
            user     = os.getenv("POSTGRES_USER",     "coco")
            password = os.getenv("POSTGRES_PASSWORD", "coco_secret")
            host     = os.getenv("POSTGRES_HOST",     "db")
            dbname   = os.getenv("POSTGRES_DB",       "cocostation")
            self.db_url = f"postgresql://{user}:{password}@{host}:5432/{dbname}"
            print(f"[DB] Local mode — {self.db_url}")

    # ── Connection helper ──────────────────────────────────────
    def _get_conn(self):
        import psycopg2
        from psycopg2.extras import RealDictCursor
        try:
            if self.conn is None or self.conn.closed:
                raise Exception("reconnect")
            # Ping to detect stale connection
            self.conn.cursor().execute("SELECT 1")
        except Exception:
            self.conn = psycopg2.connect(self.db_url, cursor_factory=RealDictCursor)
            self.conn.autocommit = True
        return self.conn

    # ── Announcements ──────────────────────────────────────────
    def get_announcements(self) -> List[Dict]:
        if self.mode == "cloud":
            try:
                res = self.supabase.table("announcements").select("*").order("created_at", desc=True).execute()
                return [self._map_ann_row(row) for row in res.data]
            except Exception as e:
                print(f"[DB] get_announcements (cloud) failed: {e}")
                return []
        else:
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM announcements ORDER BY created_at DESC")
                    return [self._map_ann_row(dict(row)) for row in cur.fetchall()]
            except Exception as e:
                print(f"[DB] get_announcements (local) failed: {e}")
                return []

    def _map_ann_row(self, row: dict) -> dict:
        """Normalise DB column names → app field names."""
        r = dict(row)
        # DB column is 'file_path', app uses 'filename'
        if "file_path" in r:
            r["filename"] = r.pop("file_path")
        # DB column is 'schedule_at', app uses 'scheduled_at'
        if "schedule_at" in r:
            r["scheduled_at"] = r.pop("schedule_at")
        # Serialise datetimes
        for key in ("created_at", "scheduled_at"):
            if isinstance(r.get(key), datetime):
                r[key] = r[key].isoformat()
        # Targets stored as JSON string or already a list
        if isinstance(r.get("targets"), str):
            try:
                r["targets"] = json.loads(r["targets"])
            except Exception:
                r["targets"] = ["ALL"]
        # Ensure status present
        if not r.get("status"):
            r["status"] = "Scheduled" if r.get("scheduled_at") else "Ready"
        # Normalise type casing (DB stores lowercase)
        if r.get("type"):
            r["type"] = r["type"].upper()
        return r

    def create_announcement(self, ann: Dict):
        """
        Persist a new announcement.
        ann['id'] must be a proper UUID string (with dashes),
        e.g. str(uuid.uuid4()) — NOT uuid.uuid4().hex.
        """
        data = {
            "id":          ann["id"],
            "name":        ann["name"],
            "text":        ann.get("text"),
            "type":        ann["type"].lower(),
            "file_path":   ann.get("filename"),
            "targets":     json.dumps(ann.get("targets", ["ALL"])),
            "schedule_at": ann.get("scheduled_at"),
            "status":      ann.get("status", "Ready"),
        }
        if self.mode == "cloud":
            try:
                self.supabase.table("announcements").insert(data).execute()
            except Exception as e:
                print(f"[DB] create_announcement (cloud) failed: {e}")
        else:
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cols   = list(data.keys())
                    vals   = [data[c] for c in cols]
                    sql    = f"INSERT INTO announcements ({', '.join(cols)}) VALUES ({', '.join(['%s']*len(vals))})"
                    cur.execute(sql, vals)
            except Exception as e:
                print(f"[DB] create_announcement (local) failed: {e}")

    def delete_announcement(self, ann_id: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("announcements").delete().eq("id", ann_id).execute()
            except Exception as e:
                print(f"[DB] delete_announcement (cloud) failed: {e}")
        else:
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM announcements WHERE id = %s", (ann_id,))
            except Exception as e:
                print(f"[DB] delete_announcement (local) failed: {e}")

    def update_announcement_status(self, ann_id: str, status: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("announcements").update({"status": status}).eq("id", ann_id).execute()
            except Exception as e:
                print(f"[DB] update_announcement_status (cloud) failed: {e}")
        else:
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE announcements SET status = %s WHERE id = %s",
                        (status, ann_id),
                    )
            except Exception as e:
                print(f"[DB] update_announcement_status (local) failed: {e}")

db = DBClient()
