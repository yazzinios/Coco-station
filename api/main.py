import os
import asyncio
import uuid
import json
import time
import httpx
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Dict, Optional
from pathlib import Path

FFMPEG_HOST = os.getenv("FFMPEG_HOST", "ffmpeg-mixer")
FFMPEG_URL  = f"http://{FFMPEG_HOST}:8001"

from schemas import (
    DeckRenameRequest, VolumeRequest, PlayRequest, MicControlRequest,
    TTSRequest, SettingUpdateRequest, LibraryItem, DeckState, Announcement
)
from tts import generate_tts
from db_client import db

MEDIA_DIR         = Path("data/library")
ANNOUNCEMENTS_DIR = Path("data/announcements")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
ANNOUNCEMENTS_DIR.mkdir(parents=True, exist_ok=True)

START_TIME    = time.time()
TRACKS_PLAYED = 0

DECKS: Dict[str, dict] = {
    "a": {"id": "a", "name": "Castle",  "track": None, "volume": 100, "is_playing": False, "is_paused": False},
    "b": {"id": "b", "name": "Deck B",  "track": None, "volume": 100, "is_playing": False, "is_paused": False},
    "c": {"id": "c", "name": "Karting", "track": None, "volume": 100, "is_playing": False, "is_paused": False},
    "d": {"id": "d", "name": "Deck D",  "track": None, "volume": 100, "is_playing": False, "is_paused": False},
}
ANNOUNCEMENTS: List[dict] = []
SETTINGS: dict = {"ducking_percent": 5, "mic_ducking_percent": 20, "on_air_beep": "default", "db_mode": "local"}
MIC_STATE: dict = {"active": False, "targets": []}

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

async def scheduler_task():
    while True:
        await asyncio.sleep(10)
        now = datetime.now()
        for ann in list(ANNOUNCEMENTS):
            if ann.get("scheduled_at") and ann.get("status") == "Scheduled":
                try:
                    if datetime.fromisoformat(ann["scheduled_at"]) <= now:
                        ann["status"] = "Played"
                        filepath = str(Path("/announcements") / ann["filename"])
                        deck_ids = ["a","b","c","d"] if "ALL" in ann.get("targets",["ALL"]) else [t.lower() for t in ann.get("targets",[])]
                        async with httpx.AsyncClient(timeout=5) as c:
                            for did in deck_ids:
                                try: await c.post(f"{FFMPEG_URL}/decks/{did}/play_announcement", json={"filepath": filepath})
                                except Exception: pass
                        await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
                        await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
                except Exception: pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ANNOUNCEMENTS
    print("CocoStation API Starting...")
    try:
        # Load announcements from DB
        ANNOUNCEMENTS = await asyncio.get_event_loop().run_in_executor(None, db.get_announcements)
        # Initialize internal status
        for a in ANNOUNCEMENTS:
            if not a.get("status"):
                a["status"] = "Scheduled" if a.get("scheduled_at") else "Ready"
    except Exception as e:
        print(f"Failed to load announcements from DB: {e}")
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
    await websocket.send_json({"type": "FULL_STATE", "decks": list(DECKS.values()), "mic": MIC_STATE, "announcements": ANNOUNCEMENTS, "settings": SETTINGS})
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

# ── Library ─────────────────────────────────────────────────
ALLOWED_AUDIO = {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"}

@app.get("/api/library", response_model=List[LibraryItem])
def list_library():
    items = [LibraryItem(filename=f.name, size=f.stat().st_size)
             for f in MEDIA_DIR.iterdir() if f.suffix.lower() in ALLOWED_AUDIO]
    return sorted(items, key=lambda x: x.filename)

@app.post("/api/library/upload")
async def upload_track(file: UploadFile = File(...)):
    if not any(file.filename.lower().endswith(e) for e in ALLOWED_AUDIO):
        raise HTTPException(status_code=400, detail="Only audio files allowed")
    dest = MEDIA_DIR / file.filename
    dest.write_bytes(await file.read())
    item = LibraryItem(filename=file.filename, size=dest.stat().st_size)
    await manager.broadcast({"type": "LIBRARY_UPDATED", "action": "added", "item": item.model_dump()})
    return {"status": "ok", "filename": file.filename, "size": dest.stat().st_size}

@app.delete("/api/library/{filename}")
async def delete_track(filename: str):
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
async def rename_deck(deck_id: str, req: DeckRenameRequest):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["name"] = req.name
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "name": req.name}

@app.post("/api/decks/{deck_id}/load")
async def load_track(deck_id: str, req: PlayRequest):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if not (MEDIA_DIR / req.track_id).exists(): raise HTTPException(status_code=404, detail="Track not found")
    DECKS[deck_id]["track"] = req.track_id
    DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id, "track": req.track_id}

@app.post("/api/decks/{deck_id}/unload")
async def unload_track(deck_id: str):
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
async def play_deck(deck_id: str):
    global TRACKS_PLAYED
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if not DECKS[deck_id]["track"]: raise HTTPException(status_code=400, detail="No track loaded")
    DECKS[deck_id]["is_playing"] = True; DECKS[deck_id]["is_paused"] = False
    TRACKS_PLAYED += 1
    filepath = str(Path("/library") / DECKS[deck_id]["track"])
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": filepath})
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/pause")
async def pause_deck(deck_id: str):
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
async def stop_deck(deck_id: str):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/decks/{deck_id}/stop")
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/volume")
async def set_deck_volume(deck_id: str, req: VolumeRequest):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    vol = max(0, min(100, req.volume)); DECKS[deck_id]["volume"] = vol
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/{vol}")
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok"}

# ── Mic ─────────────────────────────────────────────────────
@app.post("/api/mic/on")
async def mic_on(req: MicControlRequest):
    MIC_STATE["active"] = True; MIC_STATE["targets"] = req.targets
    deck_ids = ["a","b","c","d"] if "ALL" in req.targets else [t.lower() for t in req.targets]
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/mic/on", json={"targets": deck_ids})
    except Exception: pass
    await manager.broadcast({"type": "MIC_STATUS", "active": True, "targets": req.targets})
    return {"status": "ok"}

@app.post("/api/mic/off")
async def mic_off():
    MIC_STATE["active"] = False; MIC_STATE["targets"] = []
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/mic/off")
    except Exception: pass
    await manager.broadcast({"type": "MIC_STATUS", "active": False, "targets": []})
    return {"status": "ok"}

@app.get("/api/mic/status")
def mic_status(): return MIC_STATE

# ── Announcements ───────────────────────────────────────────
@app.get("/api/announcements")
def list_announcements(): return ANNOUNCEMENTS

@app.post("/api/announcements/tts")
async def create_tts_announcement(req: TTSRequest):
    try: filepath = generate_tts(req.text); filename = Path(filepath).name
    except Exception as e: raise HTTPException(status_code=500, detail=f"TTS failed: {e}")
    ann = {"id": uuid.uuid4().hex, "name": req.name, "type": "TTS", "filename": filename,
           "targets": req.targets, "status": "Scheduled" if getattr(req,'scheduled_at',None) else "Ready",
           "scheduled_at": getattr(req,'scheduled_at',None), "created_at": datetime.now().isoformat()}
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.create_announcement, ann)
    except Exception: pass
    ANNOUNCEMENTS.insert(0, ann)
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.post("/api/announcements/upload")
async def upload_announcement(file: UploadFile = File(...), name: str = "Announcement",
                               targets: str = "ALL", scheduled_at: Optional[str] = None):
    if not any(file.filename.lower().endswith(e) for e in {".mp3",".wav",".ogg"}):
        raise HTTPException(status_code=400, detail="Only audio files allowed")
    dest = ANNOUNCEMENTS_DIR / file.filename
    dest.write_bytes(await file.read())
    ann = {"id": uuid.uuid4().hex, "name": name or file.filename, "type": "MP3", "filename": file.filename,
           "targets": targets.split(",") if isinstance(targets, str) else targets,
           "status": "Scheduled" if scheduled_at else "Ready", "scheduled_at": scheduled_at,
           "created_at": datetime.now().isoformat()}
    try:
        await asyncio.get_event_loop().run_in_executor(None, db.create_announcement, ann)
    except Exception: pass
    ANNOUNCEMENTS.insert(0, ann)
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.post("/api/announcements/{ann_id}/play")
async def play_announcement(ann_id: str):
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann: raise HTTPException(status_code=404, detail="Not found")
    ann["status"] = "Played"
    filepath = str(Path("/announcements") / ann["filename"])
    deck_ids = ["a","b","c","d"] if "ALL" in ann.get("targets",["ALL"]) else [t.lower() for t in ann.get("targets",[])]
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            for did in deck_ids:
                try: await c.post(f"{FFMPEG_URL}/decks/{did}/play_announcement", json={"filepath": filepath})
                except Exception: pass
    except Exception: pass
    await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok"}

@app.delete("/api/announcements/{ann_id}")
async def delete_announcement(ann_id: str):
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

# ── Settings ────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(): return SETTINGS

@app.post("/api/settings")
async def update_settings(req: SettingUpdateRequest):
    SETTINGS.update(req.value)
    await manager.broadcast({"type": "SETTINGS_UPDATED", "settings": SETTINGS})
    return {"status": "ok", "settings": SETTINGS}

@app.post("/api/settings/db-test")
async def test_db_connection(req: SettingUpdateRequest):
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

# ── Stats ───────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    uptime = int(time.time() - START_TIME)
    h, rem = divmod(uptime, 3600); m, s = divmod(rem, 60)
    return {"uptime_seconds": uptime, "uptime_display": f"{h:02d}:{m:02d}:{s:02d}",
            "tracks_played": TRACKS_PLAYED, "playing_decks": sum(1 for d in DECKS.values() if d["is_playing"]),
            "library_count": len(list(MEDIA_DIR.glob("*.*"))), "announcements_count": len(ANNOUNCEMENTS),
            "peak_listeners": 0, "current_listeners": 0}
