import os
import json
from datetime import datetime
from typing import List, Dict, Optional

DB_MODE = os.getenv("DB_MODE", "local").lower()

# ── Default permission sets ───────────────────────────────────────────────────
# ── Default permission sets (baseline for restricted users) ──────────────────
DEFAULT_DECK_CONTROL = {
    "a": {"view": True, "control": False},
    "b": {"view": True, "control": False},
    "c": {"view": True, "control": False},
    "d": {"view": True, "control": False},
}
DEFAULT_DECK_ACTIONS = []
DEFAULT_PLAYLIST_PERMS = ["playlist.view"]


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

    def _map_recurring_schedule_row(self, row: dict) -> dict:
        r = dict(row)
        if isinstance(r.get("active_days"), str):
            try: r["active_days"] = json.loads(r["active_days"])
            except: r["active_days"] = []
        if isinstance(r.get("excluded_days"), str):
            try: r["excluded_days"] = json.loads(r["excluded_days"])
            except: r["excluded_days"] = []
        if isinstance(r.get("target_decks"), str):
            try: r["target_decks"] = json.loads(r["target_decks"])
            except: r["target_decks"] = []
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        return r

    def _map_recurring_mixer_schedule_row(self, row: dict) -> dict:
        r = dict(row)
        if isinstance(r.get("active_days"), str):
            try: r["active_days"] = json.loads(r["active_days"])
            except: r["active_days"] = []
        if isinstance(r.get("excluded_days"), str):
            try: r["excluded_days"] = json.loads(r["excluded_days"])
            except: r["excluded_days"] = []
        if isinstance(r.get("multi_tracks"), str):
            try: r["multi_tracks"] = json.loads(r["multi_tracks"])
            except: r["multi_tracks"] = []
        # Migrate old single deck_id to new deck_ids list
        if "deck_ids" in r:
            if isinstance(r["deck_ids"], str):
                try: r["deck_ids"] = json.loads(r["deck_ids"])
                except: r["deck_ids"] = [r.get("deck_id", "a")]
        elif "deck_id" in r and r.get("deck_id"):
            r["deck_ids"] = [r["deck_id"]]
        else:
            r["deck_ids"] = []
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        return r

    def _parse_jsonb(self, value, default):
        if value is None:
            return default
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return default
        return value

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
            "lang":        ann.get("lang", "en"),
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

    # ── Announcements — UPDATE ─────────────────────────────────
    def update_announcement(self, ann_id: str, updates: Dict):
        data = {}
        if "name" in updates and updates["name"] is not None:
            data["name"] = updates["name"]
        if "targets" in updates and updates["targets"] is not None:
            data["targets"] = json.dumps(updates["targets"])
        if "scheduled_at" in updates and updates["scheduled_at"] is not None:
            data["schedule_at"] = updates["scheduled_at"]
        if "status" in updates and updates["status"] is not None:
            data["status"] = updates["status"]
        if not data:
            return
        if self.mode == "cloud":
            try:
                self.supabase.table("announcements").update(data).eq("id", ann_id).execute()
            except Exception as e:
                print(f"[DB] update_announcement (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    set_clauses = ", ".join([f"{k} = %s" for k in data.keys()])
                    vals = list(data.values()) + [ann_id]
                    cur.execute(f"UPDATE announcements SET {set_clauses} WHERE id = %s", vals)
            except Exception as e:
                print(f"[DB] update_announcement (local) failed: {e}")
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
                res = self.supabase.table("decks").update({"name": name}).eq("id", deck_id).execute()
                if not res.data:
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

    # ── Recurring Schedules (Mic/Announcements) ──────────────────────────────
    def get_recurring_schedules(self) -> List[Dict]:
        if self.mode == "cloud":
            try:
                res = self.supabase.table("recurring_schedules").select("*").execute()
                return [self._map_recurring_schedule_row(r) for r in res.data]
            except Exception as e:
                print(f"[DB] get_recurring_schedules (cloud) failed: {e}")
                return []
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM recurring_schedules")
                    return [self._map_recurring_schedule_row(dict(r)) for r in cur.fetchall()]
            except Exception as e:
                print(f"[DB] get_recurring_schedules (local) failed: {e}")
                return []
            finally:
                self._put_conn(conn)

    def save_recurring_schedule(self, s: Dict):
        data = {
            "id":              s["id"],
            "name":            s["name"],
            "type":            s["type"].lower(),
            "announcement_id": s.get("announcement_id"),
            "start_time":      s["start_time"],
            "active_days":     json.dumps(s.get("active_days", [])),
            "excluded_days":   json.dumps(s.get("excluded_days", [])),
            "fade_duration":   s.get("fade_duration", 5),
            "music_volume":    s.get("music_volume", 10),
            "target_decks":    json.dumps(s.get("target_decks", [])),
            "jingle_start":    s.get("jingle_start"),
            "jingle_end":      s.get("jingle_end"),
            "enabled":         s.get("enabled", True),
        }
        if self.mode == "cloud":
            try:
                self.supabase.table("recurring_schedules").upsert(data).execute()
            except Exception as e:
                print(f"[DB] save_recurring_schedule (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO recurring_schedules
                            (id, name, type, announcement_id, start_time,
                             active_days, excluded_days, fade_duration, music_volume,
                             target_decks, jingle_start, jingle_end, enabled)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name, type = EXCLUDED.type,
                            announcement_id = EXCLUDED.announcement_id,
                            start_time = EXCLUDED.start_time,
                            active_days = EXCLUDED.active_days, excluded_days = EXCLUDED.excluded_days,
                            fade_duration = EXCLUDED.fade_duration, music_volume = EXCLUDED.music_volume,
                            target_decks = EXCLUDED.target_decks,
                            jingle_start = EXCLUDED.jingle_start, jingle_end = EXCLUDED.jingle_end,
                            enabled = EXCLUDED.enabled
                        """,
                        (data["id"], data["name"], data["type"], data["announcement_id"],
                         data["start_time"], data["active_days"], data["excluded_days"],
                         data["fade_duration"], data["music_volume"], data["target_decks"],
                         data["jingle_start"], data["jingle_end"], data["enabled"]),
                    )
            except Exception as e:
                print(f"[DB] save_recurring_schedule (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def update_recurring_last_run(self, schedule_id: str, last_run_date: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("recurring_schedules").update({"last_run_date": last_run_date}).eq("id", schedule_id).execute()
            except Exception as e:
                print(f"[DB] update_recurring_last_run (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE recurring_schedules SET last_run_date = %s WHERE id = %s",
                        (last_run_date, schedule_id),
                    )
            except Exception as e:
                print(f"[DB] update_recurring_last_run (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def delete_recurring_schedule(self, schedule_id: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("recurring_schedules").delete().eq("id", schedule_id).execute()
            except Exception as e:
                print(f"[DB] delete_recurring_schedule (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM recurring_schedules WHERE id = %s", (schedule_id,))
            except Exception as e:
                print(f"[DB] delete_recurring_schedule (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── Recurring Mixer Schedules (Music/Deck) ────────────────────────────────
    def get_recurring_mixer_schedules(self) -> List[Dict]:
        if self.mode == "cloud":
            try:
                res = self.supabase.table("recurring_mixer_schedules").select("*").execute()
                return [self._map_recurring_mixer_schedule_row(r) for r in res.data]
            except Exception as e:
                print(f"[DB] get_recurring_mixer_schedules (cloud) failed: {e}")
                return []
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM recurring_mixer_schedules ORDER BY created_at DESC")
                    return [self._map_recurring_mixer_schedule_row(dict(r)) for r in cur.fetchall()]
            except Exception as e:
                print(f"[DB] get_recurring_mixer_schedules (local) failed: {e}")
                return []
            finally:
                self._put_conn(conn)

    def save_recurring_mixer_schedule(self, s: Dict):
        raw_deck_ids = s.get("deck_ids") or ([s["deck_id"]] if s.get("deck_id") else [])
        data = {
            "id":           s["id"],
            "name":         s["name"],
            "type":         s["type"],
            "target_id":    s["target_id"],
            "deck_ids":     json.dumps(raw_deck_ids),
            "start_time":   s["start_time"],
            "active_days":  json.dumps(s.get("active_days", [])),
            "excluded_days": json.dumps(s.get("excluded_days", [])),
            "fade_in":      s.get("fade_in", 3),
            "fade_out":     s.get("fade_out", 3),
            "volume":       s.get("volume", 80),
            "loop":         s.get("loop", True),
            "jingle_start": s.get("jingle_start"),
            "jingle_end":   s.get("jingle_end"),
            "multi_tracks": json.dumps(s.get("multi_tracks", [])),
            "enabled":      s.get("enabled", True),
        }
        if self.mode == "cloud":
            try:
                self.supabase.table("recurring_mixer_schedules").upsert(data).execute()
            except Exception as e:
                print(f"[DB] save_recurring_mixer_schedule (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO recurring_mixer_schedules
                            (id, name, type, target_id, deck_ids, start_time,
                             active_days, excluded_days, fade_in, fade_out, volume, loop,
                             jingle_start, jingle_end, multi_tracks, enabled)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name, type = EXCLUDED.type,
                            target_id = EXCLUDED.target_id, deck_ids = EXCLUDED.deck_ids,
                            start_time = EXCLUDED.start_time,
                            active_days = EXCLUDED.active_days, excluded_days = EXCLUDED.excluded_days,
                            fade_in = EXCLUDED.fade_in, fade_out = EXCLUDED.fade_out,
                            volume = EXCLUDED.volume, loop = EXCLUDED.loop,
                            jingle_start = EXCLUDED.jingle_start, jingle_end = EXCLUDED.jingle_end,
                            multi_tracks = EXCLUDED.multi_tracks, enabled = EXCLUDED.enabled
                        """,
                        (data["id"], data["name"], data["type"], data["target_id"], data["deck_ids"],
                         data["start_time"], data["active_days"], data["excluded_days"],
                         data["fade_in"], data["fade_out"], data["volume"], data["loop"],
                         data["jingle_start"], data["jingle_end"], data["multi_tracks"], data["enabled"]),
                    )
            except Exception as e:
                print(f"[DB] save_recurring_mixer_schedule (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def update_recurring_mixer_last_run(self, schedule_id: str, last_run_date: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("recurring_mixer_schedules").update(
                    {"last_run_date": last_run_date}
                ).eq("id", schedule_id).execute()
            except Exception as e:
                print(f"[DB] update_recurring_mixer_last_run (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE recurring_mixer_schedules SET last_run_date = %s WHERE id = %s",
                        (last_run_date, schedule_id),
                    )
            except Exception as e:
                print(f"[DB] update_recurring_mixer_last_run (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def delete_recurring_mixer_schedule(self, schedule_id: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("recurring_mixer_schedules").delete().eq("id", schedule_id).execute()
            except Exception as e:
                print(f"[DB] delete_recurring_mixer_schedule (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM recurring_mixer_schedules WHERE id = %s", (schedule_id,))
            except Exception as e:
                print(f"[DB] delete_recurring_mixer_schedule (local) failed: {e}")
            finally:
                self._put_conn(conn)

    # ── User Management ──────────────────────────────────────

    def list_users(self) -> list:
        if self.mode == "cloud":
            try:
                r = self.supabase.table("users").select("id,username,display_name,role,is_super_admin,enabled,created_at").order("created_at").execute()
                return r.data or []
            except Exception as e:
                print(f"[DB] list_users (cloud) failed: {e}"); return []
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT u.id::text, u.username, u.display_name, u.role,
                               COALESCE(u.is_super_admin, FALSE) as is_super_admin,
                               u.enabled, u.created_at::text,
                               p.allowed_decks, p.can_announce, p.can_schedule,
                               p.can_library, p.can_requests, p.can_settings,
                               p.deck_control, p.deck_actions, p.playlist_perms
                        FROM users u
                        LEFT JOIN user_permissions p ON p.user_id = u.id
                        ORDER BY u.created_at
                    """)
                    rows = []
                    for row in cur.fetchall():
                        d = dict(row)
                        perm_keys = [
                            'allowed_decks','can_announce','can_schedule',
                            'can_library','can_requests','can_settings',
                            'deck_control','deck_actions','playlist_perms',
                        ]
                        perm = {k: d.pop(k, None) for k in perm_keys}
                        # Parse JSONB string fields
                        for jk in ('allowed_decks','deck_control','deck_actions','playlist_perms'):
                            if isinstance(perm.get(jk), str):
                                try: perm[jk] = json.loads(perm[jk])
                                except Exception: pass
                        if perm['allowed_decks'] is None:
                            perm['allowed_decks'] = ['a','b','c','d']
                        if perm['deck_control'] is None:
                            perm['deck_control'] = DEFAULT_DECK_CONTROL
                        if perm['deck_actions'] is None:
                            perm['deck_actions'] = DEFAULT_DECK_ACTIONS
                        if perm['playlist_perms'] is None:
                            perm['playlist_perms'] = DEFAULT_PLAYLIST_PERMS
                        d['permissions'] = perm
                        rows.append(d)
                    return rows
            except Exception as e:
                print(f"[DB] list_users (local) failed: {e}"); return []
            finally:
                self._put_conn(conn)

    def get_user_by_username(self, username: str) -> dict:
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute("SELECT id::text, username, display_name, password_hash, role, enabled FROM users WHERE username = %s", (username,))
                row = cur.fetchone()
                if not row: return None
                return dict(row)
        except Exception as e:
            print(f"[DB] get_user_by_username failed: {e}"); return None
        finally:
            self._put_conn(conn)

    def create_user(self, user_id: str, username: str, display_name: str, password_hash: str, role: str, is_super_admin: bool = False) -> dict:
        if self.mode == "cloud":
            try:
                r = self.supabase.table("users").insert({
                    "id": user_id, "username": username, "display_name": display_name,
                    "password_hash": password_hash, "role": role, "enabled": True,
                }).execute()
                return r.data[0] if r.data else {}
            except Exception as e:
                print(f"[DB] create_user (cloud) failed: {e}"); raise
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO users (id, username, display_name, password_hash, role, enabled) "
                        "VALUES (%s, %s, %s, %s, %s, true) RETURNING id::text, username, display_name, role, enabled",
                        (user_id, username, display_name, password_hash, role),
                    )
                    row = cur.fetchone()
                    return dict(row) if row else None
            except Exception as e:
                print(f"[DB] create_user (local) failed: {e}"); raise
            finally:
                self._put_conn(conn)

    def update_user(self, user_id: str, fields: dict):
        allowed = {"display_name", "role", "enabled", "password_hash"}
        data = {k: v for k, v in fields.items() if k in allowed}
        if not data: return
        if self.mode == "cloud":
            try:
                self.supabase.table("users").update(data).eq("id", user_id).execute()
            except Exception as e:
                print(f"[DB] update_user (cloud) failed: {e}"); raise
        else:
            conn = None
            try:
                conn = self._get_conn()
                set_clause = ", ".join(f"{k} = %s" for k in data)
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s", list(data.values()) + [user_id])
            except Exception as e:
                print(f"[DB] update_user (local) failed: {e}"); raise
            finally:
                self._put_conn(conn)

    def delete_user(self, user_id: str):
        if self.mode == "cloud":
            try:
                self.supabase.table("users").delete().eq("id", user_id).execute()
            except Exception as e:
                print(f"[DB] delete_user (cloud) failed: {e}"); raise
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            except Exception as e:
                print(f"[DB] delete_user (local) failed: {e}"); raise
            finally:
                self._put_conn(conn)

    # ── User Permissions ─────────────────────────────────────

    def get_permissions(self, user_id: str) -> dict:
        """Return full granular permissions for a user. Returns safe defaults if none set."""
        import re
        conn = None
        default = {
            "allowed_decks":   ["a", "b", "c", "d"],
            "deck_control":    DEFAULT_DECK_CONTROL,
            "deck_actions":    DEFAULT_DECK_ACTIONS,
            "playlist_perms":  DEFAULT_PLAYLIST_PERMS,
            "can_announce":    False,
            "can_schedule":    False,
            "can_library":     False,
            "can_requests":    False,
            "can_settings":    False,
        }
        # LDAP user IDs look like "ldap-username" — not valid UUIDs.
        # Passing them to Postgres's UUID column raises: invalid input syntax for type uuid.
        # Bail out early and return safe defaults instead of crashing.
        _uuid_re = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            re.IGNORECASE,
        )
        if not _uuid_re.match(str(user_id or "")):
            print(f"[DB] get_permissions: non-UUID user_id '{user_id}' — skipping DB, returning defaults")
            return default
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT allowed_decks, deck_control, deck_actions, playlist_perms,
                              can_announce, can_schedule, can_library, can_requests, can_settings
                       FROM user_permissions WHERE user_id = %s""",
                    (user_id,)
                )
                row = cur.fetchone()
                if not row:
                    return default
                data = dict(row)
                # Parse JSONB fields
                data["allowed_decks"]  = self._parse_jsonb(data.get("allowed_decks"),  ["a","b","c","d"])
                data["deck_control"]   = self._parse_jsonb(data.get("deck_control"),   DEFAULT_DECK_CONTROL)
                data["deck_actions"]   = self._parse_jsonb(data.get("deck_actions"),   DEFAULT_DECK_ACTIONS)
                data["playlist_perms"] = self._parse_jsonb(data.get("playlist_perms"), DEFAULT_PLAYLIST_PERMS)
                return data
        except Exception as e:
            print(f"[DB] get_permissions failed: {e}")
            return default
        finally:
            self._put_conn(conn)

    def save_permissions(self, user_id: str, perms: dict):
        """Upsert all permission fields for a user."""
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO user_permissions
                        (user_id, allowed_decks, deck_control, deck_actions, playlist_perms,
                         can_announce, can_schedule, can_library, can_requests, can_settings, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (user_id) DO UPDATE SET
                        allowed_decks  = EXCLUDED.allowed_decks,
                        deck_control   = EXCLUDED.deck_control,
                        deck_actions   = EXCLUDED.deck_actions,
                        playlist_perms = EXCLUDED.playlist_perms,
                        can_announce   = EXCLUDED.can_announce,
                        can_schedule   = EXCLUDED.can_schedule,
                        can_library    = EXCLUDED.can_library,
                        can_requests   = EXCLUDED.can_requests,
                        can_settings   = EXCLUDED.can_settings,
                        updated_at     = NOW()
                    """,
                    (
                        user_id,
                        json.dumps(perms.get("allowed_decks",  ["a","b","c","d"])),
                        json.dumps(perms.get("deck_control",   DEFAULT_DECK_CONTROL)),
                        json.dumps(perms.get("deck_actions",   DEFAULT_DECK_ACTIONS)),
                        json.dumps(perms.get("playlist_perms", DEFAULT_PLAYLIST_PERMS)),
                        perms.get("can_announce",  True),
                        perms.get("can_schedule",  True),
                        perms.get("can_library",   True),
                        perms.get("can_requests",  True),
                        perms.get("can_settings",  False),
                    )
                )
        except Exception as e:
            print(f"[DB] save_permissions failed: {e}"); raise
        finally:
            self._put_conn(conn)

    # ── Roles ────────────────────────────────────────────────

    def list_roles(self) -> list:
        """Return all roles ordered: system roles first, then custom."""
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id::text, name, display_name, description, color,
                           is_system,
                           default_allowed_decks, default_deck_control,
                           default_deck_actions, default_playlist_perms,
                           default_can_announce, default_can_schedule,
                           default_can_library, default_can_requests,
                           default_can_settings,
                           created_at::text
                    FROM roles
                    ORDER BY is_system DESC, created_at ASC
                """)
                rows = []
                for row in cur.fetchall():
                    d = dict(row)
                    for jk in ('default_allowed_decks', 'default_deck_control',
                               'default_deck_actions', 'default_playlist_perms'):
                        if isinstance(d.get(jk), str):
                            try: d[jk] = json.loads(d[jk])
                            except Exception: pass
                    rows.append(d)
                return rows
        except Exception as e:
            print(f"[DB] list_roles failed: {e}")
            return []
        finally:
            self._put_conn(conn)

    def get_role_by_id(self, role_id: str) -> dict:
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id::text, name, display_name, description, color,
                           is_system,
                           default_allowed_decks, default_deck_control,
                           default_deck_actions, default_playlist_perms,
                           default_can_announce, default_can_schedule,
                           default_can_library, default_can_requests,
                           default_can_settings,
                           created_at::text
                    FROM roles WHERE id = %s
                """, (role_id,))
                row = cur.fetchone()
                if not row: return None
                d = dict(row)
                for jk in ('default_allowed_decks', 'default_deck_control',
                           'default_deck_actions', 'default_playlist_perms'):
                    if isinstance(d.get(jk), str):
                        try: d[jk] = json.loads(d[jk])
                        except Exception: pass
                return d
        except Exception as e:
            print(f"[DB] get_role_by_id failed: {e}")
            return None
        finally:
            self._put_conn(conn)

    def get_role_by_name(self, name: str) -> dict:
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id::text, name, display_name, description, color,
                           is_system,
                           default_allowed_decks, default_deck_control,
                           default_deck_actions, default_playlist_perms,
                           default_can_announce, default_can_schedule,
                           default_can_library, default_can_requests,
                           default_can_settings
                    FROM roles WHERE name = %s
                """, (name,))
                row = cur.fetchone()
                if not row: return None
                d = dict(row)
                for jk in ('default_allowed_decks', 'default_deck_control',
                           'default_deck_actions', 'default_playlist_perms'):
                    if isinstance(d.get(jk), str):
                        try: d[jk] = json.loads(d[jk])
                        except Exception: pass
                return d
        except Exception as e:
            print(f"[DB] get_role_by_name failed: {e}")
            return None
        finally:
            self._put_conn(conn)

    def create_role(self, role: dict) -> dict:
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO roles
                        (id, name, display_name, description, color, is_system,
                         default_allowed_decks, default_deck_control,
                         default_deck_actions, default_playlist_perms,
                         default_can_announce, default_can_schedule,
                         default_can_library, default_can_requests,
                         default_can_settings)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (name) DO NOTHING
                    RETURNING id::text, name, display_name, description, color,
                              is_system, created_at::text
                """, (
                    role['id'], role['name'], role['display_name'],
                    role.get('description', ''), role.get('color', '#6B7280'),
                    role.get('is_system', False),
                    json.dumps(role.get('default_allowed_decks', ['a','b','c','d'])),
                    json.dumps(role.get('default_deck_control', {})),
                    json.dumps(role.get('default_deck_actions', [])),
                    json.dumps(role.get('default_playlist_perms', [])),
                    role.get('default_can_announce',  True),
                    role.get('default_can_schedule',  True),
                    role.get('default_can_library',   True),
                    role.get('default_can_requests',  True),
                    role.get('default_can_settings',  False),
                ))
                row = cur.fetchone()
                if not row:
                    return role
                return dict(row)
        except Exception as e:
            print(f"[DB] create_role failed: {e}"); raise
        finally:
            self._put_conn(conn)

    def update_role(self, role_id: str, fields: dict):
        # Serialize JSONB fields
        serializable = {
            'default_allowed_decks', 'default_deck_control',
            'default_deck_actions', 'default_playlist_perms',
        }
        data = {}
        for k, v in fields.items():
            data[k] = json.dumps(v) if k in serializable else v
        if not data:
            return
        conn = None
        try:
            conn = self._get_conn()
            set_clause = ", ".join(f"{k} = %s" for k in data)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE roles SET {set_clause}, updated_at = NOW() WHERE id = %s",
                    list(data.values()) + [role_id]
                )
        except Exception as e:
            print(f"[DB] update_role failed: {e}"); raise
        finally:
            self._put_conn(conn)

    def delete_role(self, role_id: str):
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute("DELETE FROM roles WHERE id = %s AND is_system = FALSE", (role_id,))
        except Exception as e:
            print(f"[DB] delete_role failed: {e}"); raise
        finally:
            self._put_conn(conn)

    # ── Audit Logs ────────────────────────────────────────────

    def log_action(self, user_id: str, username: str, action: str, details: dict = None, ip: str = None):
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO user_logs (user_id, username, action, details, ip_address) VALUES (%s, %s, %s, %s, %s)",
                    (str(user_id), username, action, json.dumps(details or {}), ip),
                )
        except Exception as e:
            print(f"[DB] log_action failed: {e}")
        finally:
            self._put_conn(conn)

    def get_logs(self, limit: int = 200, user_id: str = None, offset: int = 0) -> list:
        conn = None
        try:
            conn = self._get_conn()
            with conn.cursor() as cur:
                if user_id:
                    cur.execute(
                        "SELECT id::text, user_id, username, action, details, ip_address, created_at::text FROM user_logs WHERE user_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s",
                        (user_id, limit, offset)
                    )
                else:
                    cur.execute(
                        "SELECT id::text, user_id, username, action, details, ip_address, created_at::text FROM user_logs ORDER BY created_at DESC LIMIT %s OFFSET %s",
                        (limit, offset)
                    )
                return [dict(row) for row in cur.fetchall()]
        except Exception as e:
            print(f"[DB] get_logs failed: {e}"); return []
        finally:
            self._put_conn(conn)


    # ── Chimes Library ────────────────────────────────────────

    def list_chimes(self) -> list:
        """Return all rows from the chimes table, newest first."""
        if self.mode == "cloud":
            try:
                res = self.supabase.table("chimes").select("*").order("created_at", desc=True).execute()
                return res.data or []
            except Exception as e:
                print(f"[DB] list_chimes (cloud) failed: {e}"); return []
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id, name, filename, size, duration, type, created_at::text "
                        "FROM chimes ORDER BY created_at DESC"
                    )
                    return [dict(r) for r in cur.fetchall()]
            except Exception as e:
                print(f"[DB] list_chimes (local) failed: {e}"); return []
            finally:
                self._put_conn(conn)

    def save_chime(self, chime: dict):
        """Upsert a chime row (id is the primary key)."""
        if self.mode == "cloud":
            try:
                self.supabase.table("chimes").upsert(chime, on_conflict="id").execute()
            except Exception as e:
                print(f"[DB] save_chime (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO chimes (id, name, filename, size, duration, type)
                        VALUES (%(id)s, %(name)s, %(filename)s, %(size)s, %(duration)s, %(type)s)
                        ON CONFLICT (id) DO UPDATE SET
                            name     = EXCLUDED.name,
                            filename = EXCLUDED.filename,
                            size     = EXCLUDED.size,
                            duration = EXCLUDED.duration,
                            type     = EXCLUDED.type
                        """,
                        chime,
                    )
            except Exception as e:
                print(f"[DB] save_chime (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def delete_chime(self, chime_id: str):
        """Delete a chime row by id."""
        if self.mode == "cloud":
            try:
                self.supabase.table("chimes").delete().eq("id", chime_id).execute()
            except Exception as e:
                print(f"[DB] delete_chime (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM chimes WHERE id = %s", (chime_id,))
            except Exception as e:
                print(f"[DB] delete_chime (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def get_chime_by_filename(self, filename: str) -> dict:
        """Return a single chime row matched by filename, or None."""
        if self.mode == "cloud":
            try:
                res = self.supabase.table("chimes").select("*").eq("filename", filename).limit(1).execute()
                return res.data[0] if res.data else None
            except Exception as e:
                print(f"[DB] get_chime_by_filename (cloud) failed: {e}"); return None
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id, name, filename, size, duration, type, created_at::text "
                        "FROM chimes WHERE filename = %s LIMIT 1",
                        (filename,),
                    )
                    row = cur.fetchone()
                    return dict(row) if row else None
            except Exception as e:
                print(f"[DB] get_chime_by_filename (local) failed: {e}"); return None
            finally:
                self._put_conn(conn)


    # ── Company Branding ──────────────────────────────────────

    def get_branding(self) -> dict:
        """Return the single company_branding row as a dict, or empty defaults."""
        defaults = {"company_name": "", "logo_data": None, "logo_mime": None, "logo_size": 0}
        if self.mode == "cloud":
            try:
                res = self.supabase.table("company_branding").select("*").eq("id", 1).limit(1).execute()
                return dict(res.data[0]) if res.data else defaults
            except Exception as e:
                print(f"[DB] get_branding (cloud) failed: {e}"); return defaults
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT company_name, logo_data, logo_mime, logo_size FROM company_branding WHERE id = 1"
                    )
                    row = cur.fetchone()
                    return dict(row) if row else defaults
            except Exception as e:
                print(f"[DB] get_branding (local) failed: {e}"); return defaults
            finally:
                self._put_conn(conn)

    def save_branding(self, company_name: str = None, logo_data: str = None,
                      logo_mime: str = None, logo_size: int = None):
        """Upsert the single company_branding row (only updates non-None fields)."""
        if self.mode == "cloud":
            try:
                payload = {"id": 1, "updated_at": "now()"}
                if company_name is not None: payload["company_name"] = company_name
                if logo_data    is not None: payload["logo_data"]    = logo_data
                if logo_mime    is not None: payload["logo_mime"]    = logo_mime
                if logo_size    is not None: payload["logo_size"]    = logo_size
                self.supabase.table("company_branding").upsert(payload, on_conflict="id").execute()
            except Exception as e:
                print(f"[DB] save_branding (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    sets, vals = [], []
                    if company_name is not None: sets.append("company_name = %s"); vals.append(company_name)
                    if logo_data    is not None: sets.append("logo_data = %s");    vals.append(logo_data)
                    if logo_mime    is not None: sets.append("logo_mime = %s");    vals.append(logo_mime)
                    if logo_size    is not None: sets.append("logo_size = %s");    vals.append(logo_size)
                    if not sets: return
                    sets.append("updated_at = NOW()")
                    vals.append(1)  # WHERE id = 1
                    cur.execute(
                        f"UPDATE company_branding SET {', '.join(sets)} WHERE id = %s",
                        vals,
                    )
            except Exception as e:
                print(f"[DB] save_branding (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def clear_branding_logo(self):
        """Set logo fields to NULL in the company_branding row."""
        self.save_branding(logo_data=None, logo_mime=None, logo_size=0)
        # Force NULLs explicitly since save_branding skips None values
        if self.mode == "cloud":
            try:
                self.supabase.table("company_branding").update(
                    {"logo_data": None, "logo_mime": None, "logo_size": 0, "updated_at": "now()"}
                ).eq("id", 1).execute()
            except Exception as e:
                print(f"[DB] clear_branding_logo (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE company_branding SET logo_data=NULL, logo_mime=NULL, logo_size=0, updated_at=NOW() WHERE id=1"
                    )
            except Exception as e:
                print(f"[DB] clear_branding_logo (local) failed: {e}")
            finally:
                self._put_conn(conn)


    # ── LDAP User Mappings ─────────────────────────────────────────────────────

    def list_ldap_user_mappings(self) -> list:
        """Return all per-user LDAP username → role overrides."""
        if self.mode == "cloud":
            try:
                res = self.supabase.table("ldap_user_mappings").select("*").order("ldap_username").execute()
                return res.data or []
            except Exception as e:
                print(f"[DB] list_ldap_user_mappings (cloud) failed: {e}")
                return []
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT ldap_username, role, note, created_at, updated_at FROM ldap_user_mappings ORDER BY ldap_username")
                    rows = cur.fetchall()
                    result = []
                    for row in rows:
                        r = dict(row)
                        for k in ("created_at", "updated_at"):
                            if isinstance(r.get(k), datetime):
                                r[k] = r[k].isoformat()
                        result.append(r)
                    return result
            except Exception as e:
                print(f"[DB] list_ldap_user_mappings (local) failed: {e}")
                return []
            finally:
                self._put_conn(conn)

    def get_ldap_user_mapping(self, ldap_username: str) -> Optional[str]:
        """Return the role override for a specific LDAP username, or None."""
        if self.mode == "cloud":
            try:
                res = self.supabase.table("ldap_user_mappings").select("role").eq("ldap_username", ldap_username).execute()
                return res.data[0]["role"] if res.data else None
            except Exception as e:
                print(f"[DB] get_ldap_user_mapping (cloud) failed: {e}")
                return None
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("SELECT role FROM ldap_user_mappings WHERE ldap_username = %s", (ldap_username,))
                    row = cur.fetchone()
                    return row["role"] if row else None
            except Exception as e:
                print(f"[DB] get_ldap_user_mapping (local) failed: {e}")
                return None
            finally:
                self._put_conn(conn)

    def save_ldap_user_mapping(self, ldap_username: str, role: str, note: str = "") -> None:
        """Upsert a per-user LDAP username → role override."""
        if self.mode == "cloud":
            try:
                self.supabase.table("ldap_user_mappings").upsert(
                    {"ldap_username": ldap_username, "role": role, "note": note or ""},
                    on_conflict="ldap_username",
                ).execute()
            except Exception as e:
                print(f"[DB] save_ldap_user_mapping (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO ldap_user_mappings (ldap_username, role, note, updated_at)
                        VALUES (%s, %s, %s, NOW())
                        ON CONFLICT (ldap_username) DO UPDATE
                            SET role = EXCLUDED.role,
                                note = EXCLUDED.note,
                                updated_at = NOW()
                        """,
                        (ldap_username, role, note or ""),
                    )
            except Exception as e:
                print(f"[DB] save_ldap_user_mapping (local) failed: {e}")
            finally:
                self._put_conn(conn)

    def delete_ldap_user_mapping(self, ldap_username: str) -> None:
        """Remove a per-user LDAP username → role override."""
        if self.mode == "cloud":
            try:
                self.supabase.table("ldap_user_mappings").delete().eq("ldap_username", ldap_username).execute()
            except Exception as e:
                print(f"[DB] delete_ldap_user_mapping (cloud) failed: {e}")
        else:
            conn = None
            try:
                conn = self._get_conn()
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM ldap_user_mappings WHERE ldap_username = %s", (ldap_username,))
            except Exception as e:
                print(f"[DB] delete_ldap_user_mapping (local) failed: {e}")
            finally:
                self._put_conn(conn)


db = DBClient()
