import os
import json
from datetime import datetime
from typing import List, Dict, Optional

DB_MODE = os.getenv("DB_MODE", "local").lower()


class DBClient:
    def __init__(self):
        self.mode = DB_MODE
        self._pool = None  # psycopg2 SimpleConnectionPool for local mode

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

    # ── Connection pool ────────────────────────────────────────
    def _get_conn(self):
        """Return a connection from a small pool (min=1, max=3)."""
        import psycopg2
        from psycopg2 import pool as pg_pool
        from psycopg2.extras import RealDictCursor

        if self._pool is None:
            self._pool = pg_pool.SimpleConnectionPool(
                1, 3, self.db_url,
                cursor_factory=RealDictCursor,
                options="-c statement_timeout=5000",
            )

        conn = self._pool.getconn()
        conn.autocommit = True
        # Ping — return broken connections to pool and open a fresh one
        try:
            conn.cursor().execute("SELECT 1")
        except Exception:
            try:
                self._pool.putconn(conn, close=True)
            except Exception:
                pass
            conn = self._pool.getconn()
            conn.autocommit = True
        return conn

    def _put_conn(self, conn):
        """Return a connection back to the pool."""
        if self._pool and conn:
            try:
                self._pool.putconn(conn)
            except Exception:
                pass

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
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM announcements ORDER BY created_at DESC")
                    return [self._map_ann_row(dict(row)) for row in cur.fetchall()]
            except Exception as e:
                print(f"[DB] get_announcements (local) failed: {e}")
                return []
            finally:
                self._put_conn(conn)

    def _map_ann_row(self, row: dict) -> dict:
        """Normalise DB column names → app field names."""
        r = dict(row)
        if "file_path" in r:
            r["filename"] = r.pop("file_path")
        if "schedule_at" in r:
            r["scheduled_at"] = r.pop("schedule_at")
        for key in ("created_at", "scheduled_at"):
            if isinstance(r.get(key), datetime):
                r[key] = r[key].isoformat()
        if isinstance(r.get("targets"), str):
            try:
                r["targets"] = json.loads(r["targets"])
            except Exception:
                r["targets"] = ["ALL"]
        if not r.get("status"):
            r["status"] = "Scheduled" if r.get("scheduled_at") else "Ready"
        if r.get("type"):
            r["type"] = r["type"].upper()
        return r

    def create_announcement(self, ann: Dict):
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
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cols = list(data.keys())
                    vals = [data[c] for c in cols]
                    sql  = f"INSERT INTO announcements ({', '.join(cols)}) VALUES ({', '.join(['%s']*len(vals))})"
                    cur.execute(sql, vals)
            except Exception as e:
                print(f"[DB] create_announcement (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def delete_announcement(self, ann_id: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("announcements").delete().eq("id", ann_id).execute()
            except Exception as e:
                print(f"[DB] delete_announcement (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM announcements WHERE id = %s", (ann_id,))
            except Exception as e:
                print(f"[DB] delete_announcement (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def update_announcement_status(self, ann_id: str, status: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("announcements").update({"status": status}).eq("id", ann_id).execute()
            except Exception as e:
                print(f"[DB] update_announcement_status (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE announcements SET status = %s WHERE id = %s",
                        (status, ann_id),
                    )
            except Exception as e:
                print(f"[DB] update_announcement_status (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── Playlists ──────────────────────────────────────────────
    def get_playlists(self) -> List[Dict]:
        if self.mode == "cloud":
            try:
                res = self.supabase.table("playlists").select("*").order("created_at", desc=True).execute()
                return [self._map_playlist_row(r) for r in res.data]
            except Exception as e:
                print(f"[DB] get_playlists (cloud) failed: {e}")
                return []
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM playlists ORDER BY created_at DESC")
                    return [self._map_playlist_row(dict(row)) for row in cur.fetchall()]
            except Exception as e:
                print(f"[DB] get_playlists (local) failed: {e}")
                return []
            finally:
                self._put_conn(conn)

    def _map_playlist_row(self, row: dict) -> dict:
        r = dict(row)
        if isinstance(r.get("tracks"), str):
            try:
                r["tracks"] = json.loads(r["tracks"])
            except Exception:
                r["tracks"] = []
        for key in ("created_at", "updated_at"):
            if isinstance(r.get(key), datetime):
                r[key] = r[key].isoformat()
        return r

    def save_playlist(self, playlist: Dict):
        """Upsert a playlist (insert or update)."""
        data = {
            "id":     playlist["id"],
            "name":   playlist["name"],
            "tracks": json.dumps(playlist.get("tracks", [])),
        }
        if self.mode == "cloud":
            try:
                self.supabase.table("playlists").upsert(data).execute()
            except Exception as e:
                print(f"[DB] save_playlist (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO playlists (id, name, tracks)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (id) DO UPDATE
                            SET name = EXCLUDED.name,
                                tracks = EXCLUDED.tracks,
                                updated_at = CURRENT_TIMESTAMP
                        """,
                        (data["id"], data["name"], data["tracks"]),
                    )
            except Exception as e:
                print(f"[DB] save_playlist (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def delete_playlist(self, playlist_id: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("playlists").delete().eq("id", playlist_id).execute()
            except Exception as e:
                print(f"[DB] delete_playlist (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM playlists WHERE id = %s", (playlist_id,))
            except Exception as e:
                print(f"[DB] delete_playlist (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── Settings ───────────────────────────────────────────────
    def get_settings(self) -> Dict:
        """Return all settings as a flat dict."""
        if self.mode == "cloud":
            try:
                res = self.supabase.table("settings").select("*").execute()
                return {row["key"]: row["value"] for row in res.data}
            except Exception as e:
                print(f"[DB] get_settings (cloud) failed: {e}")
                return {}
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT key, value FROM settings")
                    rows = cur.fetchall()
                    result = {}
                    for row in rows:
                        v = row["value"]
                        # psycopg2 returns JSONB as Python objects already
                        if isinstance(v, str):
                            try:
                                v = json.loads(v)
                            except Exception:
                                pass
                        result[row["key"]] = v
                    return result
            except Exception as e:
                print(f"[DB] get_settings (local) failed: {e}")
                return {}
            finally:
                self._put_conn(conn)

    def save_settings(self, settings: Dict):
        """Upsert each key/value pair in settings dict."""
        if self.mode == "cloud":
            try:
                rows = [{"key": k, "value": v} for k, v in settings.items()]
                self.supabase.table("settings").upsert(rows).execute()
            except Exception as e:
                print(f"[DB] save_settings (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    for k, v in settings.items():
                        cur.execute(
                            """
                            INSERT INTO settings (key, value)
                            VALUES (%s, %s::jsonb)
                            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                            """,
                            (k, json.dumps(v)),
                        )
            except Exception as e:
                print(f"[DB] save_settings (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── Deck names ─────────────────────────────────────────────
    def get_deck_names(self) -> Dict[str, str]:
        """Return {deck_id: name} from the decks table."""
        if self.mode == "cloud":
            try:
                res = self.supabase.table("decks").select("id,name").execute()
                return {row["id"]: row["name"] for row in res.data}
            except Exception as e:
                print(f"[DB] get_deck_names (cloud) failed: {e}")
                return {}
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT id, name FROM decks")
                    return {row["id"]: row["name"] for row in cur.fetchall()}
            except Exception as e:
                print(f"[DB] get_deck_names (local) failed: {e}")
                return {}
            finally:
                self._put_conn(conn)

    def save_deck_name(self, deck_id: str, name: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("decks").update({"name": name}).eq("id", deck_id).execute()
            except Exception as e:
                print(f"[DB] save_deck_name (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO decks (id, name) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
                        (deck_id, name),
                    )
            except Exception as e:
                print(f"[DB] save_deck_name (local) failed: {e}")
            finally:
                self._put_conn(conn)


db = DBClient()
