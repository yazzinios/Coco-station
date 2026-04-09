import os
import asyncio
import uuid
import json
import time
import httpx
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Dict, Optional
from pathlib import Path

FFMPEG_HOST    = os.getenv("FFMPEG_HOST", "ffmpeg-mixer")
FFMPEG_URL     = f"http://{FFMPEG_HOST}:8001"
MEDIAMTX_HOST  = os.getenv("MEDIAMTX_HOST", "mediamtx")
MEDIAMTX_API   = f"http://{MEDIAMTX_HOST}:9997"

from schemas import (
    DeckRenameRequest, VolumeRequest, LoopRequest, PlayRequest, MicControlRequest,
    TTSRequest, SettingUpdateRequest, LibraryItem, DeckState, Announcement,
    AnnouncementUpdateRequest,
    Playlist, PlaylistCreateRequest, PlaylistLoadRequest,
    MusicScheduleCreateRequest, MusicSchedule,
    RecurringSchedule, RecurringScheduleCreateRequest,
    RecurringMixerSchedule, RecurringMixerScheduleCreateRequest,
)
from tts import generate_tts
from db_client import db
from auth import verify_token

MEDIA_DIR         = Path("data/library")
ANNOUNCEMENTS_DIR = Path("data/announcements")
CHIMES_DIR        = Path("data/chimes")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
ANNOUNCEMENTS_DIR.mkdir(parents=True, exist_ok=True)
CHIMES_DIR.mkdir(parents=True, exist_ok=True)
CHIME_FILENAME = "on_air_chime.mp3"

START_TIME    = time.time()
TRACKS_PLAYED = 0

DECKS: Dict[str, dict] = {
    "a": {"id": "a", "name": "Castle",  "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False},
    "b": {"id": "b", "name": "Deck B",  "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False},
    "c": {"id": "c", "name": "Karting", "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False},
    "d": {"id": "d", "name": "Deck D",  "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False},
}
ANNOUNCEMENTS: List[dict] = []
SETTINGS: dict = {"ducking_percent": 5, "mic_ducking_percent": 5, "on_air_beep": "default", "db_mode": "local", "on_air_chime_enabled": False}
MIC_STATE: dict = {"active": False, "targets": []}

# ── Ducking state machine ───────────────────────────────────
# Tracks how many high-priority sources (announcements + mic) are currently
# holding the duck. Music is only restored when this counter reaches zero.
# Priority: Mic > Announcement > Music
_DUCK_REFCOUNT: int = 0                    # how many sources are currently ducking
_DUCK_SAVED_VOLUMES: Dict[str, int] = {}   # the natural volumes to restore to
_DUCK_CURRENT_TYPE: str = None             # "mic" or "announcement"
_TRIGGER_LOCK = asyncio.Lock()             # prevents overlapping triggers
_ANNOUNCEMENT_EVENTS: Dict[str, asyncio.Event] = {} # per-deck events for end detection
PLAYLISTS: Dict[str, dict] = {}
DECK_PLAYLISTS: Dict[str, Optional[dict]] = {"a": None, "b": None, "c": None, "d": None}
MUSIC_SCHEDULES: List[dict] = []
RECURRING_SCHEDULES: List[dict] = []
RECURRING_MIXER_SCHEDULES: List[dict] = []   # ← NEW
MUSIC_REQUESTS: List[dict] = []               # listener song requests

class ConnectionManager:
    def __init__(self): self.active_connections: List[WebSocket] = []
    async def connect(self, ws: WebSocket):
        await ws.accept(); self.active_connections.append(ws)
    def disconnect(self, ws: WebSocket):
        if ws in self.active_connections: self.active_connections.remove(ws)
    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active_connections:
            try: await ws.send_json(message)
            except Exception: dead.append(ws)
        for d in dead: self.disconnect(d)

manager = ConnectionManager()


def _parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except Exception:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone().replace(tzinfo=None)
    return parsed


def _normalize_hhmm(value: str) -> Optional[str]:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    # Accept HH:MM[:SS] and normalize to HH:MM
    parts = value.split(":")
    if len(parts) < 2:
        return None
    hh = parts[0].zfill(2)
    mm = parts[1].zfill(2)
    return f"{hh}:{mm}"

async def _trigger_music_schedule(s: dict):
    """Load and play a track or playlist on the target deck."""
    deck_id = s.get("deck_id")
    loop    = s.get("loop", True)
    if not deck_id or deck_id not in DECKS:
        print(f"[scheduler] ERROR _trigger_music_schedule — invalid deck_id '{deck_id}' in schedule '{s.get('name')}'")
        return
    print(f"[scheduler] _trigger_music_schedule START — deck={deck_id} type={s.get('type')} name='{s.get('name')}'")
    # If currently ducked, we don't blast the music; we start it ducked.
    current_vol = s.get("volume", 80) if s.get("type") != "multi_track" else 80
    if _DUCK_REFCOUNT > 0:
        # Determine current duck level
        duck_pct = _duck_level(SETTINGS.get("mic_ducking_percent") if _DUCK_CURRENT_TYPE == "mic" else SETTINGS.get("ducking_percent"), 5)
        _DUCK_SAVED_VOLUMES[deck_id] = current_vol
        current_vol = duck_pct
        print(f"[scheduler] Ducking active. Starting music on {deck_id} at {duck_pct}% (saved {_DUCK_SAVED_VOLUMES[deck_id]}%)")

    if s["type"] == "track":
        filename = s["target_id"]
        if not (MEDIA_DIR / filename).exists():
            print(f"[scheduler] Track not found: {filename}")
            return
        DECKS[deck_id]["track"]      = filename
        DECKS[deck_id]["is_playing"] = True
        DECKS[deck_id]["is_paused"]  = False
        DECKS[deck_id]["is_loop"]    = loop
        DECKS[deck_id]["playlist_id"]    = None
        DECKS[deck_id]["playlist_index"] = None
        DECKS[deck_id]["volume"]     = current_vol
        filepath = str(Path("/library") / filename)
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": loop})
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/{current_vol}")
        except Exception as e:
            print(f"[scheduler] play track error: {e}")
    elif s["type"] == "playlist":
        playlist = PLAYLISTS.get(s["target_id"])
        if not playlist:
            print(f"[scheduler] Playlist not found: {s['target_id']}")
            return
        tracks = [t for t in playlist["tracks"] if (MEDIA_DIR / t).exists()]
        if not tracks:
            print(f"[scheduler] No valid tracks in playlist: {playlist['name']}")
            return
        DECK_PLAYLISTS[deck_id] = {"playlist_id": s["target_id"], "tracks": tracks, "index": 0, "loop": loop}
        DECKS[deck_id].update({
            "track": tracks[0], "is_playing": True, "is_paused": False,
            "is_loop": False, "playlist_id": s["target_id"],
            "playlist_index": 0, "playlist_loop": loop,
            "volume": current_vol,
        })
        filepath = str(Path("/library") / tracks[0])
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": False})
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/{current_vol}")
        except Exception as e:
            print(f"[scheduler] play playlist error: {e}")
    elif s["type"] == "multi_track":
        tracks = [t for t in s.get("multi_tracks", []) if (MEDIA_DIR / t).exists()]
        if not tracks:
            print(f"[scheduler] No valid tracks in multi_track schedule: {s.get('name')}")
            return
        DECK_PLAYLISTS[deck_id] = {"playlist_id": "multi_track", "tracks": tracks, "index": 0, "loop": loop}
        DECKS[deck_id].update({
            "track": tracks[0], "is_playing": True, "is_paused": False,
            "is_loop": False, "playlist_id": "multi_track",
            "playlist_index": 0, "playlist_loop": loop,
            "volume": current_vol,
        })
        filepath = str(Path("/library") / tracks[0])
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": False})
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/{current_vol}")
        except Exception as e:
            print(f"[scheduler] play multi_track error: {e}")
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})


async def _play_library_track_on_deck(deck_id: str, filename: str):
    """Play a single library track on a deck (used for jingles)."""
    filepath = str(Path("/library") / filename)
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play_announcement",
                         json={"filepath": filepath, "notify": False})
    except Exception as e:
        print(f"[jingle] error playing {filename} on deck {deck_id}: {e}")


async def _play_jingle_and_wait(deck_id: str, filename: Optional[str]):
    """Play a jingle track on the deck and wait for its duration."""
    if not filename:
        return
    path = MEDIA_DIR / filename
    if not path.exists():
        print(f"[jingle] file not found: {filename}")
        return
    await _play_library_track_on_deck(deck_id, filename)
    try:
        duration = await get_audio_duration(path)
        await asyncio.sleep(min(duration + 0.2, 30.0))
    except Exception:
        await asyncio.sleep(3.0)


def _get_deck_ids(rs: dict) -> List[str]:
    """Return the list of deck ids for a mixer schedule, handling both old (deck_id) and new (deck_ids) formats."""
    if rs.get("deck_ids"):
        return [d for d in rs["deck_ids"] if d in DECKS]
    if rs.get("deck_id"):
        return [rs["deck_id"]] if rs["deck_id"] in DECKS else []
    return []


async def _trigger_recurring_mixer_schedule(rs: dict):
    """
    Full mixer-start sequence for every selected deck:
      1. Play intro jingle on all target decks simultaneously
      2. Set volume on each deck
      3. Start the track / playlist on each deck
    """
    deck_ids = _get_deck_ids(rs)
    if not deck_ids:
        print(f"[mixer-scheduler] No valid decks for schedule '{rs.get('name')}'")
        return

    volume = rs.get("volume", 80)
    loop   = rs.get("loop", True)

    # Step 1 — intro jingle on all decks simultaneously (fire-and-wait the first; others overlay)
    if rs.get("jingle_start"):
        jingle_tasks = [_play_jingle_and_wait(did, rs["jingle_start"]) for did in deck_ids]
        await asyncio.gather(*jingle_tasks)

    # Step 2 — set volume on all decks
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            await asyncio.gather(*[
                c.post(f"{FFMPEG_URL}/decks/{did}/volume/{volume}")
                for did in deck_ids
            ], return_exceptions=True)
    except Exception:
        pass
    for did in deck_ids:
        DECKS[did]["volume"] = volume

    # Step 3 — start content on each deck
    for did in deck_ids:
        await _trigger_music_schedule({
            "deck_id":      did,
            "name":         rs.get("name", "Recurring"),
            "type":         rs["type"],
            "target_id":    rs["target_id"],
            "multi_tracks": rs.get("multi_tracks", []),
            "loop":         loop,
        })


async def _stop_recurring_mixer_schedule(rs: dict):
    """
    Full mixer-stop sequence for multiple decks:
      1. Fade out deck volume
      2. Stop the deck
      3. Play outro jingle (optional)
    Called when a mixer schedule is stopped.
    """
    deck_ids = _get_deck_ids(rs)
    if not deck_ids:
        return

    fade_out = rs.get("fade_out", 3)

    # Step 1 — fade out
    steps = max(1, fade_out * 5)
    delay = fade_out / steps if steps else 0.1
    current_vols = {did: DECKS.get(did, {}).get("volume", 80) for did in deck_ids}
    deltas = {did: current_vols[did] / steps for did in deck_ids}
    vols   = {did: float(current_vols[did]) for did in deck_ids}
    
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            for _ in range(steps):
                tasks = []
                for did in deck_ids:
                    vols[did] -= deltas[did]
                    v = max(0, round(vols[did]))
                    tasks.append(c.post(f"{FFMPEG_URL}/decks/{did}/volume/{v}"))
                await asyncio.gather(*tasks, return_exceptions=True)
                await asyncio.sleep(delay)
            final_tasks = [c.post(f"{FFMPEG_URL}/decks/{did}/volume/0") for did in deck_ids]
            await asyncio.gather(*final_tasks, return_exceptions=True)
    except Exception:
        pass

    # Step 2 — stop
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            stop_tasks = [c.post(f"{FFMPEG_URL}/decks/{did}/stop") for did in deck_ids]
            await asyncio.gather(*stop_tasks, return_exceptions=True)
    except Exception:
        pass
        
    for did in deck_ids:
        DECKS[did]["is_playing"] = False
        DECKS[did]["is_paused"]  = False
        DECKS[did]["volume"]     = rs.get("volume", 80)   # restore stored volume
        
    # Also restore volume on ffmpeg side
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            restore_tasks = [c.post(f"{FFMPEG_URL}/decks/{did}/volume/{rs.get('volume', 80)}") for did in deck_ids]
            await asyncio.gather(*restore_tasks, return_exceptions=True)
    except Exception:
        pass

    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})

    # Step 3 — outro jingle
    if rs.get("jingle_end"):
        jingle_tasks = [_play_jingle_and_wait(did, rs["jingle_end"]) for did in deck_ids]
        await asyncio.gather(*jingle_tasks)


def _time_matches(target_hhmm: Optional[str], now: datetime, window_seconds: int = 90) -> bool:
    """Return True if `now` is within `window_seconds` of the target HH:MM time today.
    Window is 90s (9 scheduler ticks) so container restarts and slow startups don't miss triggers."""
    norm = _normalize_hhmm(target_hhmm)
    if not norm:
        return False
    try:
        hh, mm = map(int, norm.split(':'))
        target_dt = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        diff = abs((now - target_dt).total_seconds())
        return diff <= window_seconds
    except Exception:
        return False


async def _safe_run(name: str, coro):
    """Wrap a coroutine so exceptions are logged rather than silently swallowed."""
    try:
        await coro
    except Exception as e:
        print(f"[scheduler] ERROR in task '{name}': {type(e).__name__}: {e}")


async def scheduler_task():
    print("[scheduler] Scheduler started and monitoring tasks...")
    while True:
        try:
            await asyncio.sleep(10)
            now = datetime.now()
            # print(f"[scheduler] check heartbeat: {now}") # Heartbeat
            # ── Announcements ────────────────────────────────────────
            for ann in list(ANNOUNCEMENTS):
                if ann.get("scheduled_at") and ann.get("status") == "Scheduled":
                    try:
                        # Parse and normalize timezone
                        scheduled_at = _parse_iso_datetime(ann["scheduled_at"])
                        if scheduled_at:
                            # DEBUG: Uncomment to see drift in logs
                            # print(f"[scheduler] check '{ann['name']}' ({scheduled_at}) vs now ({now})")
                            if scheduled_at <= now:
                                print(f"[scheduler] TRIGGERING one-off announcement: {ann['name']}")
                                ann["status"] = "Played"
                                filepath = str(Path("/announcements") / ann["filename"])
                                deck_ids = ["a","b","c","d"] if "ALL" in ann.get("targets",["ALL"]) else [t.lower() for t in ann.get("targets",[])]
                                
                                # Queue the trigger instead of blocking the scheduler loop
                                # Queue the trigger instead of blocking the scheduler loop
                                asyncio.create_task(fade_and_play_announcement(deck_ids, filepath))
                                
                                # Persist status to DB
                                asyncio.create_task(db.update_announcement_status(ann["id"], "Played"))

                                await manager.broadcast({"type": "NOTIFICATION", "message": f"Triggered: {ann['name']}", "style": "success"})
                                await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
                                await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
                    except Exception as e:
                        print(f"[scheduler] error triggering announcement {ann.get('id')}: {e}")
            # ── Music Schedules ──────────────────────────────────────
            for s in list(MUSIC_SCHEDULES):
                if s.get("status") == "Scheduled" and s.get("scheduled_at"):
                    try:
                        scheduled_at = _parse_iso_datetime(s["scheduled_at"])
                        if scheduled_at and scheduled_at <= now:
                            s["status"] = "Played"
                            
                            async def _run_music_task(_s=s):
                                await _trigger_music_schedule(_s)
                                await manager.broadcast({"type": "NOTIFICATION", "message": f"Scheduled Music: {_s['name']} (Deck {_s['deck_id'].upper()})", "style": "info"})
                                try:
                                    await asyncio.get_event_loop().run_in_executor(
                                        None, db.update_music_schedule_status, _s["id"], "Played"
                                    )
                                except Exception: pass
                            
                            asyncio.create_task(_run_music_task())
                    except Exception as e:
                        print(f"[scheduler] music schedule error: {e}")
            # ── Recurring Schedules (Mic/Announcement) ───────────────
            day_of_week = now.weekday()
            current_time_str = now.strftime("%H:%M")
            today_str = now.strftime("%Y-%m-%d")

            for rs in RECURRING_SCHEDULES:
                if not rs.get("enabled"): continue
                if day_of_week not in rs.get("active_days", []): continue
                if today_str in rs.get("excluded_days", []): continue

                if _time_matches(rs.get("start_time"), now) and rs.get("last_run_date") != today_str:
                    print(f"[scheduler] TRIGGERING recurring schedule '{rs['name']}' (type={rs.get('type')}, time={rs.get('start_time')})")
                    rs["last_run_date"] = today_str
                    asyncio.create_task(_safe_run(f"db.update_recurring {rs['id']}", db.update_recurring_last_run(rs["id"], today_str)))

                    deck_ids = [d.lower() for d in rs.get("target_decks", ["A"])]

                    # Always play jingle_start before announcement/mic feed
                    jingle_start = rs.get("jingle_start")
                    jingle_end   = rs.get("jingle_end")

                    if rs["type"] in ("announcement", "Announcement"):
                        ann = next((a for a in ANNOUNCEMENTS if a["id"] == rs.get("announcement_id")), None)
                        if ann:
                            # Capture closure variables NOW (avoid late-binding bugs)
                            _ann         = ann
                            _deck_ids    = list(deck_ids)
                            _jingle_start = jingle_start
                            _jingle_end   = jingle_end
                            _rs_name     = rs["name"]
                            _level       = rs.get("music_volume")

                            async def _run_ann_schedule(
                                ann=_ann, deck_ids=_deck_ids,
                                jingle_start=_jingle_start, jingle_end=_jingle_end,
                                level=_level
                            ):
                                filepath   = str(Path("/announcements") / ann["filename"])
                                local_path = ANNOUNCEMENTS_DIR / ann["filename"]
                                print(f"[scheduler] Running announcement '{ann['name']}' on decks {deck_ids}")
                                await fade_and_play_announcement(deck_ids, filepath, level=level)

                            asyncio.create_task(_safe_run(f"ann_schedule:{_rs_name}", _run_ann_schedule()))
                            await manager.broadcast({"type": "NOTIFICATION", "message": f"Recurring Announcement: {rs['name']}", "style": "success"})
                            await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})

                    elif rs["type"] in ("microphone", "Microphone"):
                        _deck_ids_mic  = list(deck_ids)
                        _jingle_start_mic = jingle_start
                        _mic_rs_name  = rs["name"]

                        async def _run_mic_schedule(
                            deck_ids=_deck_ids_mic, jingle_start=_jingle_start_mic
                        ):
                            print(f"[scheduler] Running mic schedule on decks {deck_ids}")
                            if jingle_start:
                                for did in deck_ids:
                                    await _play_jingle_and_wait(did, jingle_start)
                            await mic_on(MicControlRequest(targets=[d.upper() for d in deck_ids]), _user=None)
                        asyncio.create_task(_safe_run(f"mic_schedule:{_mic_rs_name}", _run_mic_schedule()))
                        await manager.broadcast({"type": "NOTIFICATION", "message": f"Automated Mic: {rs['name']}", "style": "info"})

                # stop_time removed — mic feed ends when user manually turns it off

            # ── Recurring Mixer Schedules ────────────────────────────
            for rs in RECURRING_MIXER_SCHEDULES:
                if not rs.get("enabled"): continue
                if day_of_week not in rs.get("active_days", []): continue
                if today_str in rs.get("excluded_days", []): continue

                # START
                if _time_matches(rs.get("start_time"), now) and rs.get("last_run_date") != today_str:
                    print(f"[mixer-scheduler] TRIGGERING '{rs['name']}' on decks {_get_deck_ids(rs)} at {rs.get('start_time')}")
                    rs["last_run_date"] = today_str
                    asyncio.create_task(_safe_run(f"db.update_mixer_last_run {rs['id']}", db.update_recurring_mixer_last_run(rs["id"], today_str)))
                    asyncio.create_task(_safe_run(f"mixer_schedule:{rs['name']}", _trigger_recurring_mixer_schedule(rs)))
                    await manager.broadcast({"type": "NOTIFICATION", "message": f"Mixer Start: {rs['name']}", "style": "success"})
                elif rs.get("last_run_date") == today_str:
                    pass  # already ran — silent, expected
                elif not _time_matches(rs.get("start_time"), now):
                    pass  # not time yet — silent, expected

        except Exception as loop_error:
            import traceback
            print(f"[scheduler] FATAL ERROR in scheduler loop: {loop_error}")
            traceback.print_exc()
            await asyncio.sleep(5) # Cooldown before retry

            # stop_time removed — music plays until track/playlist ends naturally via track_ended callback


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ANNOUNCEMENTS, PLAYLISTS, SETTINGS, MUSIC_SCHEDULES, RECURRING_SCHEDULES, RECURRING_MIXER_SCHEDULES
    print("CocoStation API Starting...")

    loop = asyncio.get_event_loop()

    try:
        ANNOUNCEMENTS = await loop.run_in_executor(None, db.get_announcements)
        for a in ANNOUNCEMENTS:
            if not a.get("status"):
                a["status"] = "Scheduled" if a.get("scheduled_at") else "Ready"
    except Exception as e:
        print(f"[startup] Failed to load announcements: {e}")

    try:
        rows = await loop.run_in_executor(None, db.get_playlists)
        PLAYLISTS = {p["id"]: p for p in rows}
        print(f"[startup] Loaded {len(PLAYLISTS)} playlist(s) from DB.")
    except Exception as e:
        print(f"[startup] Failed to load playlists: {e}")

    try:
        saved = await loop.run_in_executor(None, db.get_settings)
        if saved:
            SETTINGS.update(saved)
            print(f"[startup] Loaded settings from DB: {list(saved.keys())}")
    except Exception as e:
        print(f"[startup] Failed to load settings: {e}")

    try:
        names = await loop.run_in_executor(None, db.get_deck_names)
        for deck_id, name in names.items():
            if deck_id in DECKS:
                DECKS[deck_id]["name"] = name
        print(f"[startup] Loaded deck names from DB.")
    except Exception as e:
        print(f"[startup] Failed to load deck names: {e}")

    try:
        MUSIC_SCHEDULES = await loop.run_in_executor(None, db.get_music_schedules)
        print(f"[startup] Loaded {len(MUSIC_SCHEDULES)} music schedule(s) from DB.")
    except Exception as e:
        print(f"[startup] Failed to load music schedules: {e}")

    try:
        RECURRING_SCHEDULES = await loop.run_in_executor(None, db.get_recurring_schedules)
        # Clear last_run_date in memory so schedules always get a fresh chance after restart
        for rs in RECURRING_SCHEDULES:
            rs["last_run_date"] = None
        print(f"[startup] Loaded {len(RECURRING_SCHEDULES)} recurring schedule(s) from DB.")
    except Exception as e:
        print(f"[startup] Failed to load recurring schedules: {e}")

    try:
        RECURRING_MIXER_SCHEDULES = await loop.run_in_executor(None, db.get_recurring_mixer_schedules)
        # Clear last_run_date in memory so schedules always get a fresh chance after restart
        for rs in RECURRING_MIXER_SCHEDULES:
            rs["last_run_date"] = None
        print(f"[startup] Loaded {len(RECURRING_MIXER_SCHEDULES)} recurring mixer schedule(s) from DB.")
    except Exception as e:
        print(f"[startup] Failed to load recurring mixer schedules: {e}")

    task = asyncio.create_task(scheduler_task())
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan, title="CocoStation API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── Health ──────────────────────────────────────────────────
@app.get("/")
async def root(): return {"message": "CocoStation API is running", "status": "healthy"}

@app.get("/api/health")
def health():
    return {"status": "healthy", "uptime_seconds": int(time.time()-START_TIME), "decks": len(DECKS),
            "library_count": len(list(MEDIA_DIR.glob("*.*"))), "announcements_count": len(ANNOUNCEMENTS)}

# ── WebSocket ───────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await websocket.send_json({
        "type": "FULL_STATE",
        "decks": list(DECKS.values()),
        "mic": MIC_STATE,
        "announcements": ANNOUNCEMENTS,
        "settings": SETTINGS,
        "playlists": list(PLAYLISTS.values()),
        "music_schedules": MUSIC_SCHEDULES,
        "recurring_schedules": RECURRING_SCHEDULES,
        "recurring_mixer_schedules": RECURRING_MIXER_SCHEDULES,
        "music_requests": MUSIC_REQUESTS,
    })
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect: manager.disconnect(websocket)

@app.websocket("/ws/mic")
async def mic_audio_ws(websocket: WebSocket):
    await websocket.accept()
    ducking = SETTINGS.get("mic_ducking_percent", 20)

    async def open_ffmpeg_stream(tgts, duck):
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.post(f"{FFMPEG_URL}/mic/stream/start", json={"targets": tgts, "ducking": duck})
                return r.json().get("session_id")
        except Exception as e: print(f"[mic_ws] error: {e}"); return None

    async def close_ffmpeg_stream(sid):
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/mic/stream/stop", json={"session_id": sid})
        except Exception: pass

    session_id = None
    targets = []
    try:
        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.receive":
                if "text" in msg and msg["text"]:
                    try:
                        ctrl = json.loads(msg["text"])
                        if ctrl.get("type") == "mic_start":
                            targets = ctrl.get("targets", ["ALL"]); ducking = ctrl.get("ducking", 20)
                            MIC_STATE["active"] = True; MIC_STATE["targets"] = targets
                            session_id = await open_ffmpeg_stream(targets, ducking)
                            await manager.broadcast({"type": "MIC_STATUS", "active": True, "targets": targets})
                            await websocket.send_text(json.dumps({"type": "mic_ready", "session_id": session_id}))
                        elif ctrl.get("type") == "mic_stop":
                            was_active = MIC_STATE.get("active", False)
                            prev_targets = list(MIC_STATE.get("targets", []))
                            MIC_STATE["active"] = False; MIC_STATE["targets"] = []
                            if session_id: await close_ffmpeg_stream(session_id); session_id = None
                            await manager.broadcast({"type": "MIC_STATUS", "active": False, "targets": []})
                            if was_active:
                                deck_ids = ["a","b","c","d"] if not prev_targets or "ALL" in prev_targets else [t.lower() for t in prev_targets]
                                asyncio.create_task(fade_restore_after_mic(deck_ids))
                    except json.JSONDecodeError: pass
                elif "bytes" in msg and msg["bytes"] and session_id:
                    try:
                        async with httpx.AsyncClient(timeout=2) as c:
                            await c.post(f"{FFMPEG_URL}/mic/stream/push", content=msg["bytes"],
                                         headers={"Content-Type": "application/octet-stream", "X-Session-Id": session_id})
                    except Exception: pass
    except WebSocketDisconnect: pass
    finally:
        if session_id: await close_ffmpeg_stream(session_id)
        if MIC_STATE.get("active", False):
            prev_targets = list(MIC_STATE.get("targets", []))
            MIC_STATE["active"] = False; MIC_STATE["targets"] = []
            await manager.broadcast({"type": "MIC_STATUS", "active": False, "targets": []})
            deck_ids = ["a","b","c","d"] if not prev_targets or "ALL" in prev_targets else [t.lower() for t in prev_targets]
            asyncio.create_task(fade_restore_after_mic(deck_ids))

# ── Audio duration helper ───────────────────────────────────
async def get_audio_duration(filepath: Path) -> float:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(filepath),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL
        )
        stdout, _ = await proc.communicate()
        data = json.loads(stdout)
        return float(data["format"]["duration"])
    except Exception:
        return 2.5

# ── Fade helpers ────────────────────────────────────────────
FADE_STEPS      = 20
FADE_STEP_MS    = 60
FADE_IN_STEP_MS = 80

def _duck_level(percent: Optional[int], default: int = 5) -> int:
    try:
        value = int(percent if percent is not None else default)
    except (TypeError, ValueError):
        value = default
    return max(0, min(100, value))

async def _fade_volumes(deck_ids: list, from_pct: int, to_pct: int, step_ms: int):
    if from_pct == to_pct:
        return
    steps   = FADE_STEPS
    delta   = (to_pct - from_pct) / steps
    delay   = step_ms / 1000.0
    current = float(from_pct)
    async with httpx.AsyncClient(timeout=3) as c:
        for _ in range(steps):
            current += delta
            vol = max(0, min(100, round(current)))
            tasks = [c.post(f"{FFMPEG_URL}/decks/{did}/volume/{vol}") for did in deck_ids]
            await asyncio.gather(*tasks, return_exceptions=True)
            await asyncio.sleep(delay)
        final_tasks = [c.post(f"{FFMPEG_URL}/decks/{did}/volume/{to_pct}") for did in deck_ids]
        await asyncio.gather(*final_tasks, return_exceptions=True)

async def _restore_volumes(deck_ids: list, duck_pct: int, target_volumes: Optional[Dict[str, int]] = None):
    """
    Fade music back up from duck_pct to each deck's original volume.
    `target_volumes` is the saved {deck_id: volume} dict captured before ducking.
    If not supplied, falls back to DECKS[did]['volume'] (legacy path).
    """
    async with httpx.AsyncClient(timeout=3) as c:
        steps    = FADE_STEPS
        delay    = FADE_IN_STEP_MS / 1000.0
        # Use the explicitly-saved volumes if provided; fall back to current DECKS state
        per_deck = {did: (target_volumes[did] if target_volumes and did in target_volumes else DECKS[did]["volume"])
                    for did in deck_ids if did in DECKS}
        current  = {did: float(duck_pct) for did in deck_ids}
        deltas   = {did: (per_deck.get(did, 100) - duck_pct) / steps for did in deck_ids}
        for _ in range(steps):
            tasks = []
            for did in deck_ids:
                current[did] += deltas[did]
                vol = max(0, min(100, round(current[did])))
                tasks.append(c.post(f"{FFMPEG_URL}/decks/{did}/volume/{vol}"))
            await asyncio.gather(*tasks, return_exceptions=True)
            await asyncio.sleep(delay)
        # Snap to exact target and update DECKS state
        final_tasks = []
        for did in deck_ids:
            target = per_deck.get(did, 100)
            DECKS[did]["volume"] = target
            final_tasks.append(c.post(f"{FFMPEG_URL}/decks/{did}/volume/{target}"))
        await asyncio.gather(*final_tasks, return_exceptions=True)

# ── Chime (on-air jingle) player ───────────────────────────
async def _play_chime_and_wait(deck_ids: list):
    if not SETTINGS.get("on_air_chime_enabled", False):
        return
    chime_path = CHIMES_DIR / CHIME_FILENAME
    if not chime_path.exists():
        return
    filepath_in_container = str(Path("/chimes") / CHIME_FILENAME)
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            tasks = [
                c.post(f"{FFMPEG_URL}/decks/{did}/play_announcement",
                       json={"filepath": filepath_in_container, "notify": False})
                for did in deck_ids
            ]
            await asyncio.gather(*tasks, return_exceptions=True)
        duration = await get_audio_duration(chime_path)
        await asyncio.sleep(min(duration + 0.15, 12.0))
    except Exception as e:
        print(f"[chime] error: {e}")

# ═══════════════════════════════════════════════════════════
#  DUCKING ENGINE  —  priority-aware, ref-counted
#
#  Rules:
#    Mic > Announcement > Music
#    Music held at duck_pct until ALL active sources release.
#    Volumes are captured once (at first duck entry) or updated
#    during ducking, and restored exactly when last source releases.
# ═══════════════════════════════════════════════════════════

async def _duck_acquire(source_type: str = "announcement", level: int = None) -> None:
    """Called when a new high-priority source (announcement or mic) starts."""
    global _DUCK_REFCOUNT, _DUCK_SAVED_VOLUMES, _DUCK_CURRENT_TYPE

    _DUCK_REFCOUNT += 1
    _DUCK_CURRENT_TYPE = source_type
    print(f"[duck] acquire ({source_type}) → refcount={_DUCK_REFCOUNT}")

    # Determine duck level (Mic usually ducks more/less than announcements)
    if level is not None:
        duck_pct = level
    elif source_type == "mic":
        duck_pct = _duck_level(SETTINGS.get("mic_ducking_percent"), 5)
    else:
        duck_pct = _duck_level(SETTINGS.get("ducking_percent"), 5)

    if _DUCK_REFCOUNT == 1:
        # First source: capture CURRENT volumes as "natural" volumes
        all_playing  = [did for did in DECKS if DECKS[did].get("is_playing")]
        _DUCK_SAVED_VOLUMES = {did: DECKS[did]["volume"] for did in all_playing}
        
        if all_playing:
            from_vol = max(_DUCK_SAVED_VOLUMES.values()) if _DUCK_SAVED_VOLUMES else 100
            await _fade_volumes(all_playing, from_vol, duck_pct, FADE_STEP_MS)
            for did in all_playing:
                DECKS[did]["volume"] = duck_pct
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
            print(f"[duck] ducked {all_playing} from {_DUCK_SAVED_VOLUMES} → {duck_pct}%")
    else:
        # Subsequent sources: potentially change duck level if this source is "deeper"
        # For simplicity, we just snap to the current source's requested duck_pct
        all_playing = [did for did in DECKS if DECKS[did].get("is_playing")]
        if all_playing:
            async with httpx.AsyncClient(timeout=3) as c:
                await asyncio.gather(*[
                    c.post(f"{FFMPEG_URL}/decks/{did}/volume/{duck_pct}") 
                    for did in all_playing
                ], return_exceptions=True)
            for did in all_playing:
                DECKS[did]["volume"] = duck_pct
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})

async def _duck_release(restore_delay_ms: int = 200) -> None:
    """Called when a high-priority source ends. Music restored when last source leaves."""
    global _DUCK_REFCOUNT, _DUCK_SAVED_VOLUMES

    if _DUCK_REFCOUNT <= 0: return
    _DUCK_REFCOUNT -= 1
    print(f"[duck] release → refcount={_DUCK_REFCOUNT}")

    if _DUCK_REFCOUNT == 0:
        # Last source finished — restore music to saved natural volumes
        saved = dict(_DUCK_SAVED_VOLUMES)
        _DUCK_SAVED_VOLUMES = {}
        
        # Use generic ducking_percent as the baseline we are fading UP from
        duck_pct = _duck_level(SETTINGS.get("ducking_percent"), 5)

        if restore_delay_ms > 0:
            await asyncio.sleep(restore_delay_ms / 1000.0)

        to_restore = [did for did in saved if DECKS.get(did, {}).get("is_playing")]
        if to_restore:
            await _restore_volumes(to_restore, duck_pct, target_volumes=saved)
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
            print(f"[duck] restored {to_restore} → {saved}")
    else:
        # Other sources still active (e.g. mic still on). 
        # Check if we should adjust duck level back to the remaining source's type.
        # For now, we just stay at the current level until refcount hits 0.
        pass


# ═══════════════════════════════════════════════════════════
#  TRIGGER STATE MACHINE  (matches broadcast standard)
#
#  STATE 1 → MUSIC_NORMAL   (e.g. 80%)
#  STATE 2 → PRE_TRIGGER    (play pre.wav, music STILL at normal)
#  STATE 3 → MUSIC_DUCK     (fade normal → 5%)
#  STATE 4 → CONTENT        (announcement audio / mic live)
#  STATE 5 → POST_TRIGGER   (play post.wav, music still ducked)
#  STATE 6 → RESTORE        (fade 5% → normal)
#
#  _TRIGGER_LOCK prevents overlapping triggers.
# ═══════════════════════════════════════════════════════════

async def fade_and_play_announcement(deck_ids: list, filepath: str, level: int = None):
    """Full announcement trigger sequence with lock.
    Order: PRE-trigger → Duck → Play → POST-trigger → Restore"""
    
    if _TRIGGER_LOCK.locked():
        print(f"[trigger] Engine is busy. Adding '{Path(filepath).name}' to Trigger Queue...")
        
    async with _TRIGGER_LOCK:
        print(f"[trigger] announcement locked — {Path(filepath).name}")
        try:
            # STATE 2: PRE-TRIGGER (music still at normal volume)
            try:
                await asyncio.wait_for(_play_chime_and_wait(deck_ids), timeout=10.0)
            except asyncio.TimeoutError:
                print("[trigger] Chime timeout, proceeding anyway.")

            # STATE 3: DUCK MUSIC (normal → 5%)
            await _duck_acquire(level=level)

            # STATE 4: PLAY ANNOUNCEMENT
            ann_path   = Path(filepath)
            local_path = ANNOUNCEMENTS_DIR / ann_path.name

            # Setup end-detection events
            events = []
            for did in deck_ids:
                event = asyncio.Event()
                _ANNOUNCEMENT_EVENTS[did] = event
                events.append(event.wait())

            try:
                async with httpx.AsyncClient(timeout=5) as c:
                    tasks = [
                        c.post(f"{FFMPEG_URL}/decks/{did}/play_announcement",
                               json={"filepath": filepath})
                        for did in deck_ids
                    ]
                    responses = await asyncio.gather(*tasks, return_exceptions=True)
                    for did, resp in zip(deck_ids, responses):
                        # If a deck failed to start, set its event immediately so we don't hang the sequencer
                        if not(isinstance(resp, httpx.Response) and resp.status_code == 200):
                             if did in _ANNOUNCEMENT_EVENTS:
                                 _ANNOUNCEMENT_EVENTS[did].set()
                             print(f"[trigger] Error starting announcement on deck {did}: {resp}")
            except Exception as e:
                print(f"[trigger] play error: {e}")

            # Wait for ALL decks to finish the announcement (up to 60s safety timeout per user recommendation)
            try:
                await asyncio.wait_for(asyncio.gather(*events), timeout=60.0)
            except asyncio.TimeoutError:
                print("[trigger] Announcement wait timeout (60s)! Forcing restore.")

            for did in deck_ids:
                _ANNOUNCEMENT_EVENTS.pop(did, None)

            # small buffer gap
            await asyncio.sleep(0.3)

            # STATE 5: POST-TRIGGER (music still ducked)
            await _play_chime_and_wait(deck_ids)

        finally:
            # STATE 6: RESTORE MUSIC (5% → normal)
            await _duck_release()
            print(f"[trigger] announcement unlocked")


async def fade_and_enable_mic(deck_ids: list):
    """Mic ON trigger sequence — acquires lock (held until mic off).
    Order: PRE-trigger → Duck → mic goes live"""
    await _TRIGGER_LOCK.acquire()
    print(f"[trigger] mic locked — decks {deck_ids}")
    # STATE 2: PRE-TRIGGER (music still at normal volume)
    await _play_chime_and_wait(deck_ids)
    # STATE 3: DUCK MUSIC
    await _duck_acquire(source_type="mic")
    # STATE 4: MIC IS NOW LIVE (lock stays held until mic_off)


async def fade_restore_after_mic(deck_ids: list):
    """Mic OFF sequence — post-trigger, restore, release lock.
    Order: POST-trigger → Restore → Unlock"""
    try:
        # STATE 5: POST-TRIGGER (music still ducked)
        await _play_chime_and_wait(deck_ids)
        # STATE 6: RESTORE MUSIC
        await _duck_release()
    finally:
        try:
            _TRIGGER_LOCK.release()
            print(f"[trigger] mic unlocked")
        except RuntimeError:
            pass  # Lock wasn't held (edge case)

# ── Library ─────────────────────────────────────────────────
ALLOWED_AUDIO = {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"}

@app.get("/api/library", response_model=List[LibraryItem])
def list_library():
    items = [LibraryItem(filename=f.name, size=f.stat().st_size)
             for f in MEDIA_DIR.iterdir() if f.suffix.lower() in ALLOWED_AUDIO]
    return sorted(items, key=lambda x: x.filename)

@app.post("/api/library/upload")
async def upload_track(file: UploadFile = File(...), _user=Depends(verify_token)):
    if not any(file.filename.lower().endswith(e) for e in ALLOWED_AUDIO):
        raise HTTPException(status_code=400, detail="Only audio files allowed")
    safe_name = Path(file.filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    dest = MEDIA_DIR / safe_name
    content = await file.read()
    await asyncio.get_event_loop().run_in_executor(None, dest.write_bytes, content)
    item = LibraryItem(filename=safe_name, size=dest.stat().st_size)
    await manager.broadcast({"type": "LIBRARY_UPDATED", "action": "added", "item": item.model_dump()})
    return {"status": "ok", "filename": safe_name, "size": dest.stat().st_size}

@app.delete("/api/library/{filename}")
async def delete_track(filename: str, _user=Depends(verify_token)):
    path = MEDIA_DIR / filename
    if not path.exists(): raise HTTPException(status_code=404, detail="File not found")
    path.unlink()
    for deck in DECKS.values():
        if deck["track"] == filename:
            deck["track"] = None; deck["is_playing"] = False; deck["is_paused"] = False
    await manager.broadcast({"type": "LIBRARY_UPDATED", "action": "removed", "filename": filename})
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok"}

@app.get("/api/library/file/{filename}")
async def serve_file(filename: str):
    path = MEDIA_DIR / filename
    if not path.exists(): raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), media_type="audio/mpeg")

# ── Decks ───────────────────────────────────────────────────
@app.get("/api/decks")
def get_decks(): return list(DECKS.values())

@app.put("/api/decks/{deck_id}/name")
async def rename_deck(deck_id: str, req: DeckRenameRequest, _user=Depends(verify_token)):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["name"] = req.name
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_deck_name, deck_id, req.name)
    except Exception as e:
        print(f"[DB] Failed to persist deck name: {e}")
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "name": req.name}

@app.post("/api/decks/{deck_id}/load")
async def load_track(deck_id: str, req: PlayRequest, _user=Depends(verify_token)):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if not (MEDIA_DIR / req.track_id).exists(): raise HTTPException(status_code=404, detail="Track not found")
    DECKS[deck_id]["track"] = req.track_id
    DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id, "track": req.track_id}

@app.post("/api/decks/{deck_id}/unload")
async def unload_track(deck_id: str, _user=Depends(verify_token)):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if DECKS[deck_id]["is_playing"] or DECKS[deck_id]["is_paused"]:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/stop")
        except Exception: pass
    DECKS[deck_id]["track"] = None
    DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/play")
async def play_deck(deck_id: str, _user=Depends(verify_token)):
    global TRACKS_PLAYED
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if not DECKS[deck_id]["track"]: raise HTTPException(status_code=400, detail="No track loaded")
    DECKS[deck_id]["is_playing"] = True; DECKS[deck_id]["is_paused"] = False
    TRACKS_PLAYED += 1
    filepath = str(Path("/library") / DECKS[deck_id]["track"])
    loop = DECKS[deck_id].get("is_loop", False)
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": loop})
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/pause")
async def pause_deck(deck_id: str, _user=Depends(verify_token)):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if not DECKS[deck_id]["is_playing"] and DECKS[deck_id]["is_paused"]:
        DECKS[deck_id]["is_playing"] = True; DECKS[deck_id]["is_paused"] = False
        try:
            async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/decks/{deck_id}/resume")
        except Exception: pass
    else:
        DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = True
        try:
            async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/decks/{deck_id}/pause")
        except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/stop")
async def stop_deck(deck_id: str, _user=Depends(verify_token)):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/decks/{deck_id}/stop")
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/loop")
async def set_loop(deck_id: str, req: LoopRequest, _user=Depends(verify_token)):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["is_loop"] = req.loop
    if DECKS[deck_id]["is_playing"] and DECKS[deck_id]["track"]:
        filepath = str(Path("/library") / DECKS[deck_id]["track"])
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": req.loop})
        except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id, "loop": req.loop}

@app.post("/api/decks/{deck_id}/volume")
async def set_deck_volume(deck_id: str, req: VolumeRequest, _user=Depends(verify_token)):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    vol = max(0, min(100, req.volume))
    
    # If currently ducked, we save the NEW volume as the 'natural' volume to restore to,
    # but we don't unduck the music on the mixer side yet.
    if _DUCK_REFCOUNT > 0:
        _DUCK_SAVED_VOLUMES[deck_id] = vol
        print(f"[volume] Ducked. Saved natural volume for {deck_id} as {vol}%")
        # Optimization: We don't send anything to mixer because it's already ducked.
    else:
        DECKS[deck_id]["volume"] = vol
        try:
            async with httpx.AsyncClient(timeout=5) as c: 
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/{vol}")
        except Exception: pass
        
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok"}

# ── Mic ─────────────────────────────────────────────────────
@app.post("/api/mic/on")
async def mic_on(req: MicControlRequest, _user=Depends(verify_token)):
    if _TRIGGER_LOCK.locked():
        raise HTTPException(status_code=409, detail="Another trigger is active — please wait")
    deck_ids = ["a","b","c","d"] if "ALL" in req.targets else [t.lower() for t in req.targets]
    await fade_and_enable_mic(deck_ids)
    MIC_STATE["active"] = True; MIC_STATE["targets"] = req.targets
    await manager.broadcast({"type": "MIC_STATUS", "active": True, "targets": req.targets})
    return {"status": "ok"}

@app.post("/api/mic/off")
async def mic_off(_user=Depends(verify_token)):
    prev_targets = list(MIC_STATE.get("targets", []))
    MIC_STATE["active"] = False; MIC_STATE["targets"] = []
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/mic/off")
    except Exception: pass
    await manager.broadcast({"type": "MIC_STATUS", "active": False, "targets": []})
    deck_ids = ["a","b","c","d"] if not prev_targets or "ALL" in prev_targets else [t.lower() for t in prev_targets]
    # Run restore in background so the HTTP response returns immediately,
    # but use create_task (not fire-and-forget) so the event loop awaits it.
    # The duck refcount is decremented inside fade_restore_after_mic → _duck_release.
    asyncio.create_task(fade_restore_after_mic(deck_ids))
    return {"status": "ok"}

@app.get("/api/mic/status")
def mic_status(): return MIC_STATE

@app.post("/api/internal/announcement_ended/{deck_id}")
async def internal_announcement_ended(deck_id: str):
    if deck_id in _ANNOUNCEMENT_EVENTS:
        _ANNOUNCEMENT_EVENTS[deck_id].set()
    return {"status": "ok"}

# ── Announcements ───────────────────────────────────────────
@app.get("/api/announcements")
def list_announcements(): return ANNOUNCEMENTS

@app.post("/api/announcements/tts")
async def create_tts_announcement(req: TTSRequest, _user=Depends(verify_token)):
    try:
        filepath = await generate_tts(req.text, lang=getattr(req, 'lang', 'en'))
        filename = Path(filepath).name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {e}")
    ann_id = str(uuid.uuid4())
    ann = {
        "id": ann_id, "name": req.name, "type": "TTS", "filename": filename,
        "targets": req.targets,
        # Store text + lang so the edit form can restore them for re-generation
        "text": req.text,
        "lang": req.lang,
        "status": "Scheduled" if getattr(req, 'scheduled_at', None) else "Ready",
        "scheduled_at": getattr(req, 'scheduled_at', None),
        "created_at": datetime.now().isoformat(),
    }
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.create_announcement, ann)
    except Exception as e:
        print(f"[DB] Failed to persist TTS announcement: {e}")
    ANNOUNCEMENTS.insert(0, ann)
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.post("/api/announcements/upload")
async def upload_announcement(file: UploadFile = File(...), name: str = "Announcement",
                               targets: str = "ALL", scheduled_at: Optional[str] = None,
                               _user=Depends(verify_token)):
    if not any(file.filename.lower().endswith(e) for e in {".mp3",".wav",".ogg"}):
        raise HTTPException(status_code=400, detail="Only audio files allowed")
    safe_name = Path(file.filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    dest = ANNOUNCEMENTS_DIR / safe_name
    content = await file.read()
    await asyncio.get_event_loop().run_in_executor(None, dest.write_bytes, content)
    ann_id = str(uuid.uuid4())
    ann = {
        "id": ann_id, "name": name or safe_name, "type": "MP3", "filename": safe_name,
        "targets": targets.split(",") if isinstance(targets, str) else targets,
        "status": "Scheduled" if scheduled_at else "Ready",
        "scheduled_at": scheduled_at,
        "created_at": datetime.now().isoformat(),
    }
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.create_announcement, ann)
    except Exception as e:
        print(f"[DB] Failed to persist MP3 announcement: {e}")
    ANNOUNCEMENTS.insert(0, ann)
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.post("/api/announcements/{ann_id}/play")
async def play_announcement(ann_id: str, _user=Depends(verify_token)):
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann: raise HTTPException(status_code=404, detail="Not found")

    if _TRIGGER_LOCK.locked():
        raise HTTPException(status_code=409, detail="Another trigger is active — please wait")

    ann["status"] = "Played"
    filepath = str(Path("/announcements") / ann["filename"])
    deck_ids = ["a","b","c","d"] if "ALL" in ann.get("targets",["ALL"]) else [t.lower() for t in ann.get("targets",[])]

    # Run the full state machine (PRE → Duck → Play → POST → Restore) in background
    # so the HTTP response returns immediately to the dashboard.
    async def _play_task():
        try:
            await fade_and_play_announcement(deck_ids, filepath)
        except Exception as e:
            print(f"[trigger] announcement play task error: {e}")

    asyncio.create_task(_play_task())
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.update_announcement_status, ann_id, "Played")
    except Exception as e:
        print(f"[DB] Failed to update announcement status: {e}")
    await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok"}

@app.put("/api/announcements/{ann_id}")
async def update_announcement(ann_id: str, req: AnnouncementUpdateRequest, _user=Depends(verify_token)):
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann: raise HTTPException(status_code=404, detail="Not found")
    updates = {}
    if req.name is not None:
        ann["name"] = req.name
        updates["name"] = req.name
    if req.targets is not None:
        ann["targets"] = req.targets
        updates["targets"] = req.targets
    if req.scheduled_at is not None:
        ann["scheduled_at"] = req.scheduled_at or None
        ann["status"] = "Scheduled" if req.scheduled_at else "Ready"
        updates["scheduled_at"] = req.scheduled_at
        updates["status"] = ann["status"]
    if req.status is not None:
        ann["status"] = req.status
        updates["status"] = req.status
    if updates:
        try:
            await asyncio.get_event_loop().run_in_executor(None, db.update_announcement, ann_id, updates)
        except Exception as e:
            print(f"[DB] Failed to update announcement: {e}")
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.delete("/api/announcements/{ann_id}")
async def delete_announcement(ann_id: str, _user=Depends(verify_token)):
    global ANNOUNCEMENTS
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann: raise HTTPException(status_code=404, detail="Not found")
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.delete_announcement, ann_id)
    except Exception: pass
    ANNOUNCEMENTS = [a for a in ANNOUNCEMENTS if a["id"] != ann_id]
    p = ANNOUNCEMENTS_DIR / ann["filename"]
    if p.exists(): p.unlink()
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok"}

# ── Live Listeners (MediaMTX) ───────────────────────────────
@app.get("/api/listeners")
async def get_listeners():
    """Query mediamtx API for active readers (VLC, HLS, RTSP, WebRTC listeners) per deck."""
    result = {}
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            resp = await c.get(f"{MEDIAMTX_API}/v3/paths/list")
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("items", []):
                    path_name = item.get("name", "")
                    readers = item.get("readers", [])
                    reader_count = len(readers) if isinstance(readers, list) else 0
                    # Also check readyState and readers from the source
                    if reader_count == 0:
                        reader_count = item.get("readersCount", 0)
                    result[path_name] = {
                        "path": path_name,
                        "listeners": reader_count,
                        "ready": item.get("ready", False),
                        "source": item.get("source", {}).get("type", "unknown") if item.get("source") else "none",
                    }
    except Exception as e:
        print(f"[listeners] Failed to query mediamtx: {e}")
    # Summarize per deck
    decks_summary = {}
    total = 0
    for deck_id in ["deck-a", "deck-b", "deck-c", "deck-d"]:
        count = 0
        for path_name, info in result.items():
            if path_name.startswith(deck_id):
                count += info["listeners"]
        decks_summary[deck_id] = count
        total += count
    return {"total": total, "decks": decks_summary, "paths": result}

# ── Playlists ───────────────────────────────────────────────
@app.get("/api/playlists")
def list_playlists(): return list(PLAYLISTS.values())

@app.post("/api/playlists")
async def create_playlist(req: PlaylistCreateRequest, _user=Depends(verify_token)):
    pid = str(uuid.uuid4())
    playlist = {"id": pid, "name": req.name, "tracks": req.tracks}
    PLAYLISTS[pid] = playlist
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_playlist, playlist)
    except Exception as e:
        print(f"[DB] Failed to persist playlist: {e}")
    await manager.broadcast({"type": "PLAYLISTS_UPDATED", "playlists": list(PLAYLISTS.values())})
    return playlist

@app.put("/api/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, req: PlaylistCreateRequest, _user=Depends(verify_token)):
    if playlist_id not in PLAYLISTS: raise HTTPException(status_code=404, detail="Playlist not found")
    PLAYLISTS[playlist_id].update({"name": req.name, "tracks": req.tracks})
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_playlist, PLAYLISTS[playlist_id])
    except Exception as e:
        print(f"[DB] Failed to persist playlist update: {e}")
    await manager.broadcast({"type": "PLAYLISTS_UPDATED", "playlists": list(PLAYLISTS.values())})
    return PLAYLISTS[playlist_id]

@app.delete("/api/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, _user=Depends(verify_token)):
    if playlist_id not in PLAYLISTS: raise HTTPException(status_code=404, detail="Playlist not found")
    del PLAYLISTS[playlist_id]
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.delete_playlist, playlist_id)
    except Exception as e:
        print(f"[DB] Failed to delete playlist from DB: {e}")
    await manager.broadcast({"type": "PLAYLISTS_UPDATED", "playlists": list(PLAYLISTS.values())})
    return {"status": "ok"}

@app.post("/api/decks/{deck_id}/playlist")
async def load_playlist_to_deck(deck_id: str, req: PlaylistLoadRequest, _user=Depends(verify_token)):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    playlist = PLAYLISTS.get(req.playlist_id)
    if not playlist: raise HTTPException(status_code=404, detail="Playlist not found")
    tracks = [t for t in playlist["tracks"] if (MEDIA_DIR / t).exists()]
    if not tracks: raise HTTPException(status_code=400, detail="No valid tracks in playlist")
    if DECKS[deck_id]["is_playing"] or DECKS[deck_id]["is_paused"]:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/stop")
        except Exception: pass
    DECK_PLAYLISTS[deck_id] = {"playlist_id": req.playlist_id, "tracks": tracks, "index": 0, "loop": req.loop}
    DECKS[deck_id].update({"track": tracks[0], "is_playing": True, "is_paused": False,
                            "is_loop": False, "playlist_id": req.playlist_id,
                            "playlist_index": 0, "playlist_loop": req.loop})
    filepath = str(Path("/library") / tracks[0])
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": False})
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id, "playlist": playlist["name"], "track": tracks[0]}

@app.post("/api/decks/{deck_id}/track_ended")
async def track_ended(deck_id: str):
    if deck_id not in DECKS: return {"status": "ignored"}
    playlist_state = DECK_PLAYLISTS.get(deck_id)
    if not playlist_state:
        DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
        await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
        return {"status": "ok", "action": "stopped"}
    tracks     = playlist_state["tracks"]
    next_index = playlist_state["index"] + 1
    if next_index >= len(tracks):
        if playlist_state["loop"]:
            next_index = 0
        else:
            DECK_PLAYLISTS[deck_id] = None
            DECKS[deck_id].update({"is_playing": False, "is_paused": False, "playlist_id": None, "playlist_index": None})
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
            return {"status": "ok", "action": "playlist_done"}
    playlist_state["index"] = next_index
    next_track = tracks[next_index]
    DECKS[deck_id].update({"track": next_track, "is_playing": True, "playlist_index": next_index})
    filepath = str(Path("/library") / next_track)
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": False})
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "action": "next_track", "track": next_track}

async def _play_playlist_index(deck_id: str, index: int):
    playlist_state = DECK_PLAYLISTS.get(deck_id)
    if not playlist_state:
        raise HTTPException(status_code=400, detail="No active playlist on this deck")
    tracks = playlist_state.get("tracks", [])
    if not tracks:
        raise HTTPException(status_code=400, detail="Playlist is empty")
    max_index = len(tracks) - 1
    index = max(0, min(max_index, index))
    playlist_state["index"] = index
    track = tracks[index]
    DECKS[deck_id].update({
        "track": track,
        "is_playing": True,
        "is_paused": False,
        "playlist_index": index,
    })
    filepath = str(Path("/library") / track)
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": False})
    except Exception:
        pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id, "track": track, "playlist_index": index}

@app.post("/api/decks/{deck_id}/next")
async def deck_next_track(deck_id: str, _user=Depends(verify_token)):
    if deck_id not in DECKS:
        raise HTTPException(status_code=404, detail="Deck not found")
    playlist_state = DECK_PLAYLISTS.get(deck_id)
    if not playlist_state:
        raise HTTPException(status_code=400, detail="Next is available only for playlists")
    tracks = playlist_state.get("tracks", [])
    if not tracks:
        raise HTTPException(status_code=400, detail="Playlist is empty")
    cur = int(playlist_state.get("index", 0))
    nxt = cur + 1
    if nxt >= len(tracks):
        nxt = 0 if playlist_state.get("loop", False) else len(tracks) - 1
    return await _play_playlist_index(deck_id, nxt)

@app.post("/api/decks/{deck_id}/previous")
async def deck_previous_track(deck_id: str, _user=Depends(verify_token)):
    if deck_id not in DECKS:
        raise HTTPException(status_code=404, detail="Deck not found")
    playlist_state = DECK_PLAYLISTS.get(deck_id)
    if not playlist_state:
        raise HTTPException(status_code=400, detail="Previous is available only for playlists")
    tracks = playlist_state.get("tracks", [])
    if not tracks:
        raise HTTPException(status_code=400, detail="Playlist is empty")
    cur = int(playlist_state.get("index", 0))
    prev = cur - 1
    if prev < 0:
        prev = len(tracks) - 1 if playlist_state.get("loop", False) else 0
    return await _play_playlist_index(deck_id, prev)

# ── Chime ────────────────────────────────────────────────────
@app.post("/api/settings/chime/upload")
async def upload_chime(file: UploadFile = File(...), _user=Depends(verify_token)):
    if not any(file.filename.lower().endswith(e) for e in {".mp3", ".wav", ".ogg"}):
        raise HTTPException(status_code=400, detail="Only audio files allowed")
    dest = CHIMES_DIR / CHIME_FILENAME
    content = await file.read()
    await asyncio.get_event_loop().run_in_executor(None, dest.write_bytes, content)
    return {"status": "ok", "filename": CHIME_FILENAME}

@app.get("/api/settings/chime/status")
def chime_status():
    chime_path = CHIMES_DIR / CHIME_FILENAME
    return {"exists": chime_path.exists(), "enabled": SETTINGS.get("on_air_chime_enabled", False)}

@app.delete("/api/settings/chime")
async def delete_chime(_user=Depends(verify_token)):
    chime_path = CHIMES_DIR / CHIME_FILENAME
    if chime_path.exists(): chime_path.unlink()
    return {"status": "ok"}

# ── Settings ────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(): return SETTINGS

@app.post("/api/settings")
async def update_settings(req: SettingUpdateRequest, _user=Depends(verify_token)):
    SETTINGS.update(req.value)
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_settings, req.value)
    except Exception as e:
        print(f"[DB] Failed to persist settings: {e}")
    await manager.broadcast({"type": "SETTINGS_UPDATED", "settings": SETTINGS})
    return {"status": "ok", "settings": SETTINGS}

# ── Scheduler Status ───────────────────────────────────────
@app.get("/api/scheduler/status")
def scheduler_status():
    """Live view of scheduler state — useful for debugging without reading Docker logs."""
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    def _will_run(rs):
        return (
            rs.get("enabled", False) and
            now.weekday() in rs.get("active_days", []) and
            today not in rs.get("excluded_days", []) and
            rs.get("last_run_date") != today
        )
    return {
        "time_now": now.strftime("%H:%M:%S"),
        "today": today,
        "day_of_week": now.weekday(),
        "trigger_lock_held": _TRIGGER_LOCK.locked(),
        "duck_refcount": _DUCK_REFCOUNT,
        "recurring_mixer_schedules": [
            {
                "id": rs["id"],
                "name": rs["name"],
                "enabled": rs.get("enabled"),
                "start_time": rs.get("start_time"),
                "active_days": rs.get("active_days"),
                "last_run_date": rs.get("last_run_date"),
                "will_run_today": _will_run(rs),
            }
            for rs in RECURRING_MIXER_SCHEDULES
        ],
        "recurring_schedules": [
            {
                "id": rs["id"],
                "name": rs["name"],
                "enabled": rs.get("enabled"),
                "start_time": rs.get("start_time"),
                "active_days": rs.get("active_days"),
                "last_run_date": rs.get("last_run_date"),
                "will_run_today": _will_run(rs),
            }
            for rs in RECURRING_SCHEDULES
        ],
    }

@app.post("/api/recurring-mixer-schedules/{schedule_id}/reset")
async def reset_mixer_schedule(schedule_id: str, _user=Depends(verify_token)):
    """Clear last_run_date so the schedule can fire again today (useful for testing)."""
    rs = next((x for x in RECURRING_MIXER_SCHEDULES if x["id"] == schedule_id), None)
    if not rs:
        raise HTTPException(status_code=404, detail="Schedule not found")
    rs["last_run_date"] = None
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.update_recurring_mixer_last_run, schedule_id, None)
    except Exception as e:
        print(f"[DB] Failed to reset mixer last_run_date: {e}")
    return {"status": "ok", "message": f"'{rs['name']}' reset — will fire next matching window"}

@app.post("/api/recurring-schedules/{schedule_id}/reset")
async def reset_recurring_schedule(schedule_id: str, _user=Depends(verify_token)):
    """Clear last_run_date so the schedule can fire again today (useful for testing)."""
    rs = next((x for x in RECURRING_SCHEDULES if x["id"] == schedule_id), None)
    if not rs:
        raise HTTPException(status_code=404, detail="Schedule not found")
    rs["last_run_date"] = None
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.update_recurring_last_run, schedule_id, None)
    except Exception as e:
        print(f"[DB] Failed to reset recurring last_run_date: {e}")
    return {"status": "ok", "message": f"'{rs['name']}' reset — will fire next matching window"}

# ── Trigger Management ─────────────────────────────────────
@app.post("/api/trigger/reset")
async def reset_trigger_lock(_user=Depends(verify_token)):
    """Force release the trigger lock if system gets stuck."""
    if _TRIGGER_LOCK.locked():
        try:
            _TRIGGER_LOCK.release()
            print("[trigger] Force released lock via API")
            return {"status": "ok", "message": "Trigger lock force released"}
        except RuntimeError:
            return {"status": "error", "message": "Lock not held"}
    return {"status": "ok", "message": "Lock was not held"}

@app.post("/api/trigger/announcement")
async def trigger_test_announcement(_user=Depends(verify_token)):
    """Manual trigger for the most recent announcement (for testing)."""
    if not ANNOUNCEMENTS:
        raise HTTPException(status_code=404, detail="No announcements available")
    ann = ANNOUNCEMENTS[0]
    return await play_announcement(ann["id"], _user=_user)

@app.post("/api/settings/db-test")
async def test_db_connection(req: SettingUpdateRequest, _user=Depends(verify_token)):
    mode = req.value.get("db_mode", SETTINGS.get("db_mode", "local"))
    supabase_url = req.value.get("supabase_url") or os.getenv("SUPABASE_URL", "")
    supabase_key = req.value.get("supabase_key") or os.getenv("SUPABASE_SERVICE_KEY", "")
    if mode == "local":
        try:
            import psycopg2
            conn = psycopg2.connect(host=os.getenv("POSTGRES_HOST","db"), port=5432,
                                    user=os.getenv("POSTGRES_USER","coco"),
                                    password=os.getenv("POSTGRES_PASSWORD","coco_secret"),
                                    dbname=os.getenv("POSTGRES_DB","cocostation"), connect_timeout=3)
            conn.close()
            from migrate import run_migrations_local
            db_url = f"postgresql://{os.getenv('POSTGRES_USER','coco')}:{os.getenv('POSTGRES_PASSWORD','coco_secret')}@{os.getenv('POSTGRES_HOST','db')}:5432/{os.getenv('POSTGRES_DB','cocostation')}"
            await asyncio.get_event_loop().run_in_executor(None, run_migrations_local, db_url)
            return {"status": "ok", "mode": "local", "migrations": "applied"}
        except Exception as e: raise HTTPException(status_code=503, detail=f"Local DB unreachable: {e}")
    else:
        if not supabase_url or not supabase_key:
            raise HTTPException(status_code=400, detail="Supabase URL and Service Key required")
        try:
            async with httpx.AsyncClient(timeout=6) as c:
                r = await c.get(f"{supabase_url}/rest/v1/", headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"})
            if r.status_code >= 500: raise HTTPException(status_code=503, detail=f"Supabase returned {r.status_code}")
            from migrate import run_migrations_cloud
            ran = await asyncio.get_event_loop().run_in_executor(None, run_migrations_cloud, supabase_url, supabase_key)
            os.environ["SUPABASE_URL"] = supabase_url; os.environ["SUPABASE_SERVICE_KEY"] = supabase_key
            return {"status": "ok", "mode": "cloud", "migrations_applied": ran}
        except HTTPException: raise
        except Exception as e: raise HTTPException(status_code=503, detail=f"Supabase unreachable: {e}")

# ── Music Schedules ────────────────────────────────────────
@app.get("/api/music-schedules")
def list_music_schedules(): return MUSIC_SCHEDULES

@app.post("/api/music-schedules")
async def create_music_schedule(req: MusicScheduleCreateRequest, _user=Depends(verify_token)):
    if req.deck_id not in DECKS: raise HTTPException(status_code=400, detail="Invalid deck_id")
    if req.type not in ("track", "playlist"): raise HTTPException(status_code=400, detail="type must be 'track' or 'playlist'")
    if req.type == "track" and not (MEDIA_DIR / req.target_id).exists():
        raise HTTPException(status_code=404, detail=f"Track '{req.target_id}' not found in library")
    if req.type == "playlist" and req.target_id not in PLAYLISTS:
        raise HTTPException(status_code=404, detail=f"Playlist '{req.target_id}' not found")
    sid = str(uuid.uuid4())
    schedule = {"id": sid, "name": req.name, "deck_id": req.deck_id, "type": req.type,
                "target_id": req.target_id, "scheduled_at": req.scheduled_at,
                "loop": req.loop, "status": "Scheduled", "created_at": datetime.now().isoformat()}
    MUSIC_SCHEDULES.append(schedule)
    MUSIC_SCHEDULES.sort(key=lambda x: x["scheduled_at"])
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.create_music_schedule, schedule)
    except Exception as e:
        print(f"[DB] Failed to persist music schedule: {e}")
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})
    return schedule

@app.delete("/api/music-schedules/{schedule_id}")
async def delete_music_schedule(schedule_id: str, _user=Depends(verify_token)):
    global MUSIC_SCHEDULES
    s = next((x for x in MUSIC_SCHEDULES if x["id"] == schedule_id), None)
    if not s: raise HTTPException(status_code=404, detail="Schedule not found")
    MUSIC_SCHEDULES = [x for x in MUSIC_SCHEDULES if x["id"] != schedule_id]
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.delete_music_schedule, schedule_id)
    except Exception: pass
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})
    return {"status": "ok"}

@app.post("/api/music-schedules/{schedule_id}/trigger")
async def trigger_music_schedule_now(schedule_id: str, _user=Depends(verify_token)):
    s = next((x for x in MUSIC_SCHEDULES if x["id"] == schedule_id), None)
    if not s: raise HTTPException(status_code=404, detail="Schedule not found")
    s["status"] = "Played"
    await _trigger_music_schedule(s)
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.update_music_schedule_status, schedule_id, "Played")
    except Exception: pass
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})
    return {"status": "ok"}

# ── Recurring Schedules (Mic / Announcements) ────────────────
@app.get("/api/recurring-schedules")
def list_recurring_schedules(): return RECURRING_SCHEDULES

@app.post("/api/recurring-schedules")
async def create_recurring_schedule(req: RecurringScheduleCreateRequest, _user=Depends(verify_token)):
    sid = str(uuid.uuid4())
    schedule = {
        "id": sid, "name": req.name, "type": req.type,
        "announcement_id": req.announcement_id,
        "start_time": req.start_time,
        # stop_time not stored
        "active_days": req.active_days, "excluded_days": req.excluded_days,
        "fade_duration": req.fade_duration, "music_volume": req.music_volume,
        "target_decks": req.target_decks,
        "jingle_start": req.jingle_start, "jingle_end": req.jingle_end,
        "enabled": req.enabled, "last_run_date": None,
        "created_at": datetime.now().isoformat(),
    }
    RECURRING_SCHEDULES.append(schedule)
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_recurring_schedule, schedule)
    except Exception as e:
        print(f"[DB] Failed to persist recurring schedule: {e}")
    await manager.broadcast({"type": "RECURRING_SCHEDULES_UPDATED", "schedules": RECURRING_SCHEDULES})
    return schedule

@app.put("/api/recurring-schedules/{schedule_id}")
async def update_recurring_schedule(schedule_id: str, req: RecurringScheduleCreateRequest, _user=Depends(verify_token)):
    idx = next((i for i, x in enumerate(RECURRING_SCHEDULES) if x["id"] == schedule_id), None)
    if idx is None: raise HTTPException(status_code=404, detail="Schedule not found")
    updated = RECURRING_SCHEDULES[idx].copy()
    updated.update({
        "name": req.name, "type": req.type, "announcement_id": req.announcement_id,
        "start_time": req.start_time,
        # stop_time not stored
        "active_days": req.active_days, "excluded_days": req.excluded_days,
        "fade_duration": req.fade_duration, "music_volume": req.music_volume,
        "target_decks": req.target_decks,
        "jingle_start": req.jingle_start, "jingle_end": req.jingle_end,
        "enabled": req.enabled,
        "last_run_date": None, # Reset allowing immediate re-testing
    })
    RECURRING_SCHEDULES[idx] = updated
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_recurring_schedule, updated)
    except Exception as e:
        print(f"[DB] Failed to persist recurring schedule update: {e}")
    await manager.broadcast({"type": "RECURRING_SCHEDULES_UPDATED", "schedules": RECURRING_SCHEDULES})
    return updated

@app.delete("/api/recurring-schedules/{schedule_id}")
async def delete_recurring_schedule(schedule_id: str, _user=Depends(verify_token)):
    global RECURRING_SCHEDULES
    RECURRING_SCHEDULES = [x for x in RECURRING_SCHEDULES if x["id"] != schedule_id]
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.delete_recurring_schedule, schedule_id)
    except Exception: pass
    await manager.broadcast({"type": "RECURRING_SCHEDULES_UPDATED", "schedules": RECURRING_SCHEDULES})
    return {"status": "ok"}

# ── Recurring Mixer Schedules (Music / Deck) ─────────────────  NEW
@app.get("/api/recurring-mixer-schedules")
def list_recurring_mixer_schedules():
    return RECURRING_MIXER_SCHEDULES

@app.post("/api/recurring-mixer-schedules")
async def create_recurring_mixer_schedule(req: RecurringMixerScheduleCreateRequest, _user=Depends(verify_token)):
    invalid = [d for d in req.deck_ids if d not in DECKS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid deck_ids: {invalid}")
    if not req.deck_ids:
        raise HTTPException(status_code=400, detail="At least one deck_id required")
    sid = str(uuid.uuid4())
    schedule = {
        "id": sid, "name": req.name, "type": req.type,
        "target_id": req.target_id, "deck_ids": req.deck_ids,
        "start_time": req.start_time,
        # stop_time not stored
        "active_days": req.active_days, "excluded_days": req.excluded_days,
        "fade_in": req.fade_in, "fade_out": req.fade_out,
        "volume": req.volume, "loop": req.loop,
        "jingle_start": req.jingle_start, "jingle_end": req.jingle_end,
        "multi_tracks": req.multi_tracks,
        "enabled": req.enabled, "last_run_date": None,
        "created_at": datetime.now().isoformat(),
    }
    RECURRING_MIXER_SCHEDULES.append(schedule)
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_recurring_mixer_schedule, schedule)
    except Exception as e:
        print(f"[DB] Failed to persist recurring mixer schedule: {e}")
    await manager.broadcast({"type": "RECURRING_MIXER_SCHEDULES_UPDATED", "schedules": RECURRING_MIXER_SCHEDULES})
    return schedule

@app.put("/api/recurring-mixer-schedules/{schedule_id}")
async def update_recurring_mixer_schedule(schedule_id: str, req: RecurringMixerScheduleCreateRequest, _user=Depends(verify_token)):
    idx = next((i for i, x in enumerate(RECURRING_MIXER_SCHEDULES) if x["id"] == schedule_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    updated = RECURRING_MIXER_SCHEDULES[idx].copy()
    updated.update({
        "name": req.name, "type": req.type,
        "target_id": req.target_id, "deck_ids": req.deck_ids,
        "start_time": req.start_time,
        # stop_time not stored
        "active_days": req.active_days, "excluded_days": req.excluded_days,
        "fade_in": req.fade_in, "fade_out": req.fade_out,
        "volume": req.volume, "loop": req.loop,
        "jingle_start": req.jingle_start, "jingle_end": req.jingle_end,
        "multi_tracks": req.multi_tracks,
        "enabled": req.enabled,
        "last_run_date": None, # Reset allowing immediate re-testing
    })
    RECURRING_MIXER_SCHEDULES[idx] = updated
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_recurring_mixer_schedule, updated)
    except Exception as e:
        print(f"[DB] Failed to persist recurring mixer schedule update: {e}")
    await manager.broadcast({"type": "RECURRING_MIXER_SCHEDULES_UPDATED", "schedules": RECURRING_MIXER_SCHEDULES})
    return updated

@app.delete("/api/recurring-mixer-schedules/{schedule_id}")
async def delete_recurring_mixer_schedule(schedule_id: str, _user=Depends(verify_token)):
    global RECURRING_MIXER_SCHEDULES
    RECURRING_MIXER_SCHEDULES = [x for x in RECURRING_MIXER_SCHEDULES if x["id"] != schedule_id]
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.delete_recurring_mixer_schedule, schedule_id)
    except Exception: pass
    await manager.broadcast({"type": "RECURRING_MIXER_SCHEDULES_UPDATED", "schedules": RECURRING_MIXER_SCHEDULES})
    return {"status": "ok"}

# ── Stats ───────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    uptime = int(time.time() - START_TIME)
    h, rem = divmod(uptime, 3600); m, s = divmod(rem, 60)
    return {"uptime_seconds": uptime, "uptime_display": f"{h:02d}:{m:02d}:{s:02d}",
            "tracks_played": TRACKS_PLAYED, "playing_decks": sum(1 for d in DECKS.values() if d["is_playing"]),
            "library_count": len(list(MEDIA_DIR.glob("*.*"))), "announcements_count": len(ANNOUNCEMENTS),
            "peak_listeners": 0, "current_listeners": 0}

# ═══════════════════════════════════════════════════════════
#  MUSIC REQUESTS (public — no auth for submit)
# ═══════════════════════════════════════════════════════════

@app.get("/api/library/public")
def list_library_public():
    """Public listing — returns filenames only (no auth required)."""
    items = [{"filename": f.name} for f in MEDIA_DIR.iterdir() if f.suffix.lower() in ALLOWED_AUDIO]
    return sorted(items, key=lambda x: x["filename"])

from pydantic import BaseModel as _PydanticBase

class MusicRequestSubmit(_PydanticBase):
    requester_name: str
    requester_email: Optional[str] = None
    requester_phone: Optional[str] = None
    requester_photo: Optional[str] = None
    track: str
    message: Optional[str] = None
    target_deck: Optional[str] = None

@app.post("/api/requests")
async def submit_music_request(req: MusicRequestSubmit):
    """Public endpoint — anyone can submit a song request."""
    # Validate track exists
    track_path = MEDIA_DIR / req.track
    if not track_path.exists():
        raise HTTPException(status_code=404, detail="Track not found in library")

    # Rate limit: max 3 pending requests per email
    if req.requester_email:
        existing = [r for r in MUSIC_REQUESTS if r.get("requester_email") == req.requester_email and r["status"] == "pending"]
        if len(existing) >= 3:
            raise HTTPException(status_code=429, detail="Maximum 3 pending requests per user")

    request_id = str(uuid.uuid4())
    music_req = {
        "id": request_id,
        "requester_name": req.requester_name,
        "requester_email": req.requester_email,
        "requester_phone": req.requester_phone,
        "requester_photo": req.requester_photo,
        "track": req.track,
        "message": req.message,
        "target_deck": req.target_deck,
        "status": "pending",  # pending | accepted | dismissed
        "created_at": datetime.now().isoformat(),
    }
    MUSIC_REQUESTS.insert(0, music_req)
    await manager.broadcast({"type": "REQUESTS_UPDATED", "requests": MUSIC_REQUESTS})
    print(f"[request] New request from {req.requester_name}: {req.track}")
    return {"status": "ok", "request": music_req}

@app.get("/api/requests")
async def list_music_requests(_user=Depends(verify_token)):
    return MUSIC_REQUESTS

@app.post("/api/requests/{request_id}/accept")
async def accept_music_request(request_id: str, _user=Depends(verify_token)):
    req = next((r for r in MUSIC_REQUESTS if r["id"] == request_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req["status"] = "accepted"

    # Auto-load track to target deck if specified, otherwise find first available
    deck_id = (req.get("target_deck") or "a").lower()
    if deck_id not in DECKS:
        deck_id = "a"

    filename = req["track"]
    filepath = str(Path("/library") / filename)
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/load", json={"filepath": filepath})
        DECKS[deck_id]["track"] = filename
        DECKS[deck_id]["is_playing"] = False
        DECKS[deck_id]["is_paused"] = False
        await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    except Exception as e:
        print(f"[request] Failed to load track to deck: {e}")

    await manager.broadcast({"type": "REQUESTS_UPDATED", "requests": MUSIC_REQUESTS})
    return {"status": "ok", "loaded_to": deck_id}

@app.delete("/api/requests/{request_id}")
async def dismiss_music_request(request_id: str, _user=Depends(verify_token)):
    global MUSIC_REQUESTS
    req = next((r for r in MUSIC_REQUESTS if r["id"] == request_id), None)
    if req:
        req["status"] = "dismissed"
    MUSIC_REQUESTS = [r for r in MUSIC_REQUESTS if r["status"] == "pending"]
    await manager.broadcast({"type": "REQUESTS_UPDATED", "requests": MUSIC_REQUESTS})
    return {"status": "ok"}

@app.delete("/api/requests")
async def clear_all_requests(_user=Depends(verify_token)):
    global MUSIC_REQUESTS
    MUSIC_REQUESTS = []
    await manager.broadcast({"type": "REQUESTS_UPDATED", "requests": MUSIC_REQUESTS})
    return {"status": "ok"}
