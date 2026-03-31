import os
import asyncio
import uuid
import json
import time
import httpx
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Dict, Optional
from pathlib import Path

FFMPEG_HOST = os.getenv("FFMPEG_HOST", "ffmpeg-mixer")
FFMPEG_URL  = f"http://{FFMPEG_HOST}:8001"

from schemas import (
    DeckRenameRequest, VolumeRequest, LoopRequest, PlayRequest, MicControlRequest,
    TTSRequest, SettingUpdateRequest, LibraryItem, DeckState, Announcement,
    Playlist, PlaylistCreateRequest, PlaylistLoadRequest,
    MusicScheduleCreateRequest, MusicSchedule,
    RecurringSchedule, RecurringScheduleCreateRequest
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
SETTINGS: dict = {"ducking_percent": 5, "mic_ducking_percent": 20, "on_air_beep": "default", "db_mode": "local", "on_air_chime_enabled": False}
MIC_STATE: dict = {"active": False, "targets": []}
PLAYLISTS: Dict[str, dict] = {}
DECK_PLAYLISTS: Dict[str, Optional[dict]] = {"a": None, "b": None, "c": None, "d": None}
MUSIC_SCHEDULES: List[dict] = []
RECURRING_SCHEDULES: List[dict] = []

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

async def _trigger_music_schedule(s: dict):
    """Load and play a track or playlist on the target deck."""
    deck_id = s["deck_id"]
    loop    = s.get("loop", False)
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
        filepath = str(Path("/library") / filename)
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": loop})
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
        })
        filepath = str(Path("/library") / tracks[0])
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath, "loop": False})
        except Exception as e:
            print(f"[scheduler] play playlist error: {e}")
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})

async def scheduler_task():
    while True:
        await asyncio.sleep(10)
        now = datetime.now()
        # ── Announcements ────────────────────────────────────────
        for ann in list(ANNOUNCEMENTS):
            if ann.get("scheduled_at") and ann.get("status") == "Scheduled":
                try:
                    if datetime.fromisoformat(ann["scheduled_at"]) <= now:
                        ann["status"] = "Played"
                        filepath = str(Path("/announcements") / ann["filename"])
                        deck_ids = ["a","b","c","d"] if "ALL" in ann.get("targets",["ALL"]) else [t.lower() for t in ann.get("targets",[])]
                        await fade_and_play_announcement(deck_ids, filepath)
                        await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
                        await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
                except Exception: pass
        # ── Music Schedules ──────────────────────────────────────
        for s in list(MUSIC_SCHEDULES):
            if s.get("status") == "Scheduled" and s.get("scheduled_at"):
                try:
                    if datetime.fromisoformat(s["scheduled_at"]) <= now:
                        s["status"] = "Played"
                        await _trigger_music_schedule(s)
                        try:
                            await asyncio.get_event_loop().run_in_executor(
                                None, db.update_music_schedule_status, s["id"], "Played"
                            )
                        except Exception: pass
                except Exception as e:
                    print(f"[scheduler] music schedule error: {e}")
        # ── Recurring Schedules ──────────────────────────────────
        day_of_week = now.weekday() # 0-6 (Mon-Sun)
        current_time_str = now.strftime("%H:%M")
        today_str = now.strftime("%Y-%m-%d")

        for rs in RECURRING_SCHEDULES:
            if not rs.get("enabled"): continue
            if day_of_week not in rs.get("active_days", []): continue
            
            # Check Start
            if rs.get("start_time") == current_time_str and rs.get("last_run_date") != today_str:
                rs["last_run_date"] = today_str
                asyncio.create_task(db.update_recurring_last_run(rs["id"], today_str))
                
                deck_ids = [d.lower() for d in rs.get("target_decks", ["A"])]
                if rs["type"] == "announcement":
                    ann = next((a for a in ANNOUNCEMENTS if a["id"] == rs["announcement_id"]), None)
                    if ann:
                        filepath = str(Path("/announcements") / ann["filename"])
                        asyncio.create_task(fade_and_play_announcement(deck_ids, filepath))
                        await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
                elif rs["type"] == "microphone":
                    # For mic, we turn it on at start_time and off at stop_time
                    await mic_on(MicControlRequest(targets=[d.upper() for d in deck_ids]), _user=None)

            # Check Stop (only for Microphone type)
            if rs["type"] == "microphone" and rs.get("stop_time") == current_time_str:
                # To prevent flickering, we only stop if it was likely turned on by this scheduler
                if MIC_STATE["active"]:
                    await mic_off(_user=None)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ANNOUNCEMENTS, PLAYLISTS, SETTINGS, MUSIC_SCHEDULES, RECURRING_SCHEDULES
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
        print(f"[startup] Loaded {len(RECURRING_SCHEDULES)} recurring schedule(s) from DB.")
    except Exception as e:
        print(f"[startup] Failed to load recurring schedules: {e}")

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
    await websocket.send_json({"type": "FULL_STATE", "decks": list(DECKS.values()), "mic": MIC_STATE, "announcements": ANNOUNCEMENTS, "settings": SETTINGS, "playlists": list(PLAYLISTS.values()), "music_schedules": MUSIC_SCHEDULES, "recurring_schedules": RECURRING_SCHEDULES})
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
                            MIC_STATE["active"] = False; MIC_STATE["targets"] = []
                            if session_id: await close_ffmpeg_stream(session_id); session_id = None
                            await manager.broadcast({"type": "MIC_STATUS", "active": False, "targets": []})
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
        MIC_STATE["active"] = False; MIC_STATE["targets"] = []
        await manager.broadcast({"type": "MIC_STATUS", "active": False, "targets": []})

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
FADE_STEPS      = 20          # number of volume steps
FADE_STEP_MS    = 60          # ms between steps  → ~1.2 s total fade
FADE_IN_STEP_MS = 80          # slightly slower fade-in → ~1.6 s

async def _fade_volumes(deck_ids: list, from_pct: int, to_pct: int, step_ms: int):
    """Smoothly transition volume on the given decks from from_pct → to_pct."""
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
            tasks = [
                c.post(f"{FFMPEG_URL}/decks/{did}/volume/{vol}")
                for did in deck_ids
            ]
            await asyncio.gather(*tasks, return_exceptions=True)
            await asyncio.sleep(delay)
        # Snap to exact target
        final_tasks = [
            c.post(f"{FFMPEG_URL}/decks/{did}/volume/{to_pct}")
            for did in deck_ids
        ]
        await asyncio.gather(*final_tasks, return_exceptions=True)

async def _restore_volumes(deck_ids: list):
    """Fade volumes back to each deck's stored volume level."""
    # Group decks by target volume for efficiency
    async with httpx.AsyncClient(timeout=3) as c:
        steps   = FADE_STEPS
        delay   = FADE_IN_STEP_MS / 1000.0
        # Build per-deck fade: start from ducking level, end at stored volume
        duck_pct = SETTINGS.get("ducking_percent", 5)
        per_deck = {did: DECKS[did]["volume"] for did in deck_ids if did in DECKS}
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
        # Snap to stored volumes
        final_tasks = [
            c.post(f"{FFMPEG_URL}/decks/{did}/volume/{per_deck.get(did, 100)}")
            for did in deck_ids
        ]
        await asyncio.gather(*final_tasks, return_exceptions=True)

# ── Chime (jingle) player ───────────────────────────────────
async def _play_chime_and_wait(deck_ids: list):
    """Play the on-air chime on all target decks and wait for it to finish."""
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
                       json={"filepath": filepath_in_container})
                for did in deck_ids
            ]
            await asyncio.gather(*tasks, return_exceptions=True)
        duration = await get_audio_duration(chime_path)
        await asyncio.sleep(min(duration + 0.15, 12.0))
    except Exception as e:
        print(f"[chime] error: {e}")

# ── Master sequence: fade-out → jingle → content → fade-in ──
async def fade_and_play_announcement(deck_ids: list, filepath: str):
    """
    Full announcement / mic-on sequence:
      1. Fade music down to ducking_percent
      2. Play jingle (if enabled) and wait for it to finish
      3. Play the announcement audio on all target decks
      4. Wait for announcement to finish
      5. Fade music back up to original volumes
    """
    duck_pct = SETTINGS.get("ducking_percent", 5)

    # Step 1 — fade out
    playing_decks = [did for did in deck_ids if DECKS.get(did, {}).get("is_playing")]
    if playing_decks:
        await _fade_volumes(playing_decks, 100, duck_pct, FADE_STEP_MS)

    # Step 2 — jingle
    await _play_chime_and_wait(deck_ids)

    # Step 3 — play announcement
    ann_path = Path(filepath)
    # resolve local path for duration measurement
    local_path = ANNOUNCEMENTS_DIR / ann_path.name
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            tasks = [
                c.post(f"{FFMPEG_URL}/decks/{did}/play_announcement",
                       json={"filepath": filepath})
                for did in deck_ids
            ]
            await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        print(f"[announcement] play error: {e}")

    # Step 4 — wait for announcement duration
    try:
        duration = await get_audio_duration(local_path)
        await asyncio.sleep(max(0.5, duration + 0.3))
    except Exception:
        await asyncio.sleep(3.0)

    # Step 5 — fade music back in
    if playing_decks:
        await _restore_volumes(playing_decks)

async def fade_and_enable_mic(deck_ids: list):
    """
    Mic-on sequence:
      1. Fade music down to mic_ducking_percent
      2. Play jingle (if enabled) and wait
      Music stays ducked while mic is live; caller restores on mic-off.
    """
    duck_pct = SETTINGS.get("mic_ducking_percent", 20)
    playing_decks = [did for did in deck_ids if DECKS.get(did, {}).get("is_playing")]
    if playing_decks:
        await _fade_volumes(playing_decks, 100, duck_pct, FADE_STEP_MS)
    await _play_chime_and_wait(deck_ids)

async def fade_restore_after_mic(deck_ids: list):
    """Fade music back up after mic goes off air."""
    playing_decks = [did for did in deck_ids if DECKS.get(did, {}).get("is_playing")]
    if playing_decks:
        await _restore_volumes(playing_decks)

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
    vol = max(0, min(100, req.volume)); DECKS[deck_id]["volume"] = vol
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/{vol}")
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok"}

# ── Mic ─────────────────────────────────────────────────────
@app.post("/api/mic/on")
async def mic_on(req: MicControlRequest, _user=Depends(verify_token)):
    deck_ids = ["a","b","c","d"] if "ALL" in req.targets else [t.lower() for t in req.targets]
    # Fade music down + play jingle before opening mic
    await fade_and_enable_mic(deck_ids)
    MIC_STATE["active"] = True; MIC_STATE["targets"] = req.targets
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/mic/on", json={"targets": deck_ids})
    except Exception: pass
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
    # Fade music back up after mic goes off
    deck_ids = ["a","b","c","d"] if not prev_targets or "ALL" in prev_targets else [t.lower() for t in prev_targets]
    asyncio.create_task(fade_restore_after_mic(deck_ids))
    return {"status": "ok"}

@app.get("/api/mic/status")
def mic_status(): return MIC_STATE

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
    ann["status"] = "Played"
    filepath = str(Path("/announcements") / ann["filename"])
    deck_ids = ["a","b","c","d"] if "ALL" in ann.get("targets",["ALL"]) else [t.lower() for t in ann.get("targets",[])]
    # Full sequence: fade → jingle → announce → fade back
    asyncio.create_task(fade_and_play_announcement(deck_ids, filepath))
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.update_announcement_status, ann_id, "Played")
    except Exception as e:
        print(f"[DB] Failed to update announcement status: {e}")
    await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok"}

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

# ── Playlists ───────────────────────────────────────────────
@app.get("/api/playlists")
def list_playlists():
    return list(PLAYLISTS.values())

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
    if playlist_id not in PLAYLISTS:
        raise HTTPException(status_code=404, detail="Playlist not found")
    PLAYLISTS[playlist_id].update({"name": req.name, "tracks": req.tracks})
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.save_playlist, PLAYLISTS[playlist_id])
    except Exception as e:
        print(f"[DB] Failed to persist playlist update: {e}")
    await manager.broadcast({"type": "PLAYLISTS_UPDATED", "playlists": list(PLAYLISTS.values())})
    return PLAYLISTS[playlist_id]

@app.delete("/api/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, _user=Depends(verify_token)):
    if playlist_id not in PLAYLISTS:
        raise HTTPException(status_code=404, detail="Playlist not found")
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
    if deck_id not in DECKS:
        return {"status": "ignored"}
    playlist_state = DECK_PLAYLISTS.get(deck_id)
    if not playlist_state:
        DECKS[deck_id]["is_playing"] = False
        DECKS[deck_id]["is_paused"]  = False
        await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
        return {"status": "ok", "action": "stopped"}
    tracks     = playlist_state["tracks"]
    next_index = playlist_state["index"] + 1
    if next_index >= len(tracks):
        if playlist_state["loop"]:
            next_index = 0
        else:
            DECK_PLAYLISTS[deck_id] = None
            DECKS[deck_id].update({"is_playing": False, "is_paused": False,
                                    "playlist_id": None, "playlist_index": None})
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
def list_music_schedules():
    return MUSIC_SCHEDULES

@app.post("/api/music-schedules")
async def create_music_schedule(req: MusicScheduleCreateRequest, _user=Depends(verify_token)):
    if req.deck_id not in DECKS:
        raise HTTPException(status_code=400, detail="Invalid deck_id")
    if req.type not in ("track", "playlist"):
        raise HTTPException(status_code=400, detail="type must be 'track' or 'playlist'")
    if req.type == "track" and not (MEDIA_DIR / req.target_id).exists():
        raise HTTPException(status_code=404, detail=f"Track '{req.target_id}' not found in library")
    if req.type == "playlist" and req.target_id not in PLAYLISTS:
        raise HTTPException(status_code=404, detail=f"Playlist '{req.target_id}' not found")

    sid = str(uuid.uuid4())
    schedule = {
        "id":           sid,
        "name":         req.name,
        "deck_id":      req.deck_id,
        "type":         req.type,
        "target_id":    req.target_id,
        "scheduled_at": req.scheduled_at,
        "loop":         req.loop,
        "status":       "Scheduled",
        "created_at":   datetime.now().isoformat(),
    }
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
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    MUSIC_SCHEDULES = [x for x in MUSIC_SCHEDULES if x["id"] != schedule_id]
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.delete_music_schedule, schedule_id)
    except Exception: pass
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})
    return {"status": "ok"}

@app.post("/api/music-schedules/{schedule_id}/trigger")
async def trigger_music_schedule_now(schedule_id: str, _user=Depends(verify_token)):
    """Immediately trigger a scheduled music event (for testing / manual override)."""
    s = next((x for x in MUSIC_SCHEDULES if x["id"] == schedule_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    s["status"] = "Played"
    await _trigger_music_schedule(s)
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.update_music_schedule_status, schedule_id, "Played")
    except Exception: pass
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})
    return {"status": "ok"}

# ── Recurring Schedules ──────────────────────────────────
@app.get("/api/recurring-schedules")
def list_recurring_schedules():
    return RECURRING_SCHEDULES

@app.post("/api/recurring-schedules")
async def create_recurring_schedule(req: RecurringScheduleCreateRequest, _user=Depends(verify_token)):
    sid = str(uuid.uuid4())
    schedule = {
        "id":              sid,
        "name":            req.name,
        "type":            req.type,
        "announcement_id": req.announcement_id,
        "start_time":      req.start_time,
        "stop_time":       req.stop_time,
        "active_days":     req.active_days,
        "fade_duration":   req.fade_duration,
        "music_volume":    req.music_volume,
        "target_decks":    req.target_decks,
        "enabled":         req.enabled,
        "last_run_date":   None,
        "created_at":      datetime.now().isoformat(),
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
    if idx is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    updated = RECURRING_SCHEDULES[idx].copy()
    updated.update({
        "name":            req.name,
        "type":            req.type,
        "announcement_id": req.announcement_id,
        "start_time":      req.start_time,
        "stop_time":       req.stop_time,
        "active_days":     req.active_days,
        "fade_duration":   req.fade_duration,
        "music_volume":    req.music_volume,
        "target_decks":    req.target_decks,
        "enabled":         req.enabled,
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

# ── Stats ───────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    uptime = int(time.time() - START_TIME)
    h, rem = divmod(uptime, 3600); m, s = divmod(rem, 60)
    return {"uptime_seconds": uptime, "uptime_display": f"{h:02d}:{m:02d}:{s:02d}",
            "tracks_played": TRACKS_PLAYED, "playing_decks": sum(1 for d in DECKS.values() if d["is_playing"]),
            "library_count": len(list(MEDIA_DIR.glob("*.*"))), "announcements_count": len(ANNOUNCEMENTS),
            "peak_listeners": 0, "current_listeners": 0}
