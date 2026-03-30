import os
import json
from datetime import datetime
from typing import List, Dict, Optional

DB_MODE = os.getenv("DB_MODE", "local").lower()


class DBClient:
    def __init__(self):
        self.mode = DB_MODE
        self._pool = None

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
        if self._pool and conn:
            try:
                self._pool.putconn(conn)
            except Exception:
                pass

    # ── Shared helpers ─────────────────────────────────────────
    def _map_ann_row(self, row: dict) -> dict:
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

    # ── Announcements — READ ───────────────────────────────────
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

    # ── Announcements — CREATE ─────────────────────────────────
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
                    placeholders = ", ".join(["%s"] * len(vals))
                    sql = (
                        f"INSERT INTO announcements ({', '.join(cols)}) "
                        f"VALUES ({placeholders}) "
                        f"ON CONFLICT (id) DO NOTHING"
                    )
                    cur.execute(sql, vals)
            except Exception as e:
                print(f"[DB] create_announcement (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── Announcements — UPDATE STATUS ──────────────────────────
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

    # ── Announcements — DELETE ─────────────────────────────────
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

    # ── Playlists — READ ───────────────────────────────────────
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

    # ── Playlists — UPSERT ─────────────────────────────────────
    def save_playlist(self, playlist: Dict):
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
                            SET name       = EXCLUDED.name,
                                tracks     = EXCLUDED.tracks,
                                updated_at = CURRENT_TIMESTAMP
                        """,
                        (data["id"], data["name"], data["tracks"]),
                    )
            except Exception as e:
                print(f"[DB] save_playlist (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── Playlists — DELETE ─────────────────────────────────────
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

    # ── Settings — READ ────────────────────────────────────────
    def get_settings(self) -> Dict:
        if self.mode == "cloud":
            try:
                res = self.supabase.table("settings").select("*").execute()
                result = {}
                for row in res.data:
                    v = row["value"]
                    # Supabase returns JSONB as Python objects already
                    result[row["key"]] = v
                return result
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

    # ── Settings — UPSERT ──────────────────────────────────────
    def save_settings(self, settings: Dict):
        if self.mode == "cloud":
            try:
                rows = [{"key": k, "value": v} for k, v in settings.items()]
                self.supabase.table("settings").upsert(rows, on_conflict="key").execute()
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

    # ── Deck names — READ ──────────────────────────────────────
    def get_deck_names(self) -> Dict[str, str]:
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

    # ── Deck names — UPSERT ────────────────────────────────────
    def save_deck_name(self, deck_id: str, name: str):
        if self.mode == "cloud":
            try:
                # Try update first; if the row doesn't exist yet, upsert it
                res = self.supabase.table("decks").update({"name": name}).eq("id", deck_id).execute()
                if not res.data:
                    # Row didn't exist — insert it
                    self.supabase.table("decks").insert({"id": deck_id, "name": name}).execute()
            except Exception as e:
                print(f"[DB] save_deck_name (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO decks (id, name)
                        VALUES (%s, %s)
                        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
                        """,
                        (deck_id, name),
                    )
            except Exception as e:
                print(f"[DB] save_deck_name (local) failed: {e}")
            finally:
                self._put_conn(conn)


    # ── Music Schedules — READ ───────────────────────────────
    def get_music_schedules(self) -> List[Dict]:
        if self.mode == "cloud":
            try:
                res = self.supabase.table("music_schedules").select("*").order("scheduled_at", desc=False).execute()
                return [self._map_schedule_row(r) for r in res.data]
            except Exception as e:
                print(f"[DB] get_music_schedules (cloud) failed: {e}")
                return []
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM music_schedules ORDER BY scheduled_at ASC")
                    return [self._map_schedule_row(dict(r)) for r in cur.fetchall()]
            except Exception as e:
                print(f"[DB] get_music_schedules (local) failed: {e}")
                return []
            finally:
                self._put_conn(conn)

    def _map_schedule_row(self, row: dict) -> dict:
        r = dict(row)
        for key in ("scheduled_at", "created_at"):
            if isinstance(r.get(key), datetime):
                r[key] = r[key].isoformat()
        return r

    # ── Music Schedules — CREATE ─────────────────────────────
    def create_music_schedule(self, s: Dict):
        data = {
            "id":           s["id"],
            "name":         s["name"],
            "deck_id":      s["deck_id"],
            "type":         s["type"],
            "target_id":    s["target_id"],
            "scheduled_at": s["scheduled_at"],
            "loop":         s.get("loop", False),
            "status":       s.get("status", "Scheduled"),
        }
        if self.mode == "cloud":
            try:
                self.supabase.table("music_schedules").insert(data).execute()
            except Exception as e:
                print(f"[DB] create_music_schedule (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO music_schedules (id, name, deck_id, type, target_id, scheduled_at, loop, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (data["id"], data["name"], data["deck_id"], data["type"],
                         data["target_id"], data["scheduled_at"], data["loop"], data["status"]),
                    )
            except Exception as e:
                print(f"[DB] create_music_schedule (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── Music Schedules — UPDATE STATUS ──────────────────────
    def update_music_schedule_status(self, schedule_id: str, status: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("music_schedules").update({"status": status}).eq("id", schedule_id).execute()
            except Exception as e:
                print(f"[DB] update_music_schedule_status (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE music_schedules SET status = %s WHERE id = %s",
                        (status, schedule_id),
                    )
            except Exception as e:
                print(f"[DB] update_music_schedule_status (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── Music Schedules — DELETE ──────────────────────────────
    def delete_music_schedule(self, schedule_id: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("music_schedules").delete().eq("id", schedule_id).execute()
            except Exception as e:
                print(f"[DB] delete_music_schedule (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM music_schedules WHERE id = %s", (schedule_id,))
            except Exception as e:
                print(f"[DB] delete_music_schedule (local) failed: {e}")
            finally:
                self._put_conn(conn)


db = DBClient()
