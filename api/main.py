import os
import asyncio
import uuid
import json
import time
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Dict, Optional

import shutil
from pathlib import Path
from schemas import (
    DeckRenameRequest, VolumeRequest, PlayRequest, MicControlRequest,
    TTSRequest, SettingUpdateRequest, LibraryItem, DeckState, Announcement
)
from tts import generate_tts

MEDIA_DIR = Path("data/library")
ANNOUNCEMENTS_DIR = Path("data/announcements")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
ANNOUNCEMENTS_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────
# In-memory state
# ─────────────────────────────────────────
START_TIME = time.time()
TRACKS_PLAYED = 0

DECKS: Dict[str, dict] = {
    "a": {"id": "a", "name": "Castle",  "track": None, "volume": 100, "is_playing": False, "is_paused": False},
    "b": {"id": "b", "name": "Deck B",  "track": None, "volume": 100, "is_playing": False, "is_paused": False},
    "c": {"id": "c", "name": "Karting", "track": None, "volume": 100, "is_playing": False, "is_paused": False},
    "d": {"id": "d", "name": "Deck D",  "track": None, "volume": 100, "is_playing": False, "is_paused": False},
}

ANNOUNCEMENTS: List[dict] = []

SETTINGS: dict = {
    "ducking_percent": 5,
    "on_air_beep": "default",
    "db_mode": "local",
}

MIC_STATE: dict = {"active": False, "targets": []}

# ─────────────────────────────────────────
# WebSocket manager
# ─────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.disconnect(d)

manager = ConnectionManager()

# ─────────────────────────────────────────
# App lifecycle
# ─────────────────────────────────────────
async def scheduler_task():
    """Check every 30 seconds for announcements due to be played."""
    while True:
        await asyncio.sleep(30)
        now = datetime.now()
        for ann in ANNOUNCEMENTS:
            if ann.get("scheduled_at") and ann.get("status") == "Scheduled":
                try:
                    scheduled = datetime.fromisoformat(ann["scheduled_at"])
                    if scheduled <= now:
                        ann["status"] = "Played"
                        await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
                        await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
                except Exception:
                    pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("CocoStation API Starting...")
    task = asyncio.create_task(scheduler_task())
    yield
    task.cancel()
    print("CocoStation API Shutting down.")

app = FastAPI(lifespan=lifespan, title="CocoStation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────
# ROOT / HEALTH
# ─────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "CocoStation API is running", "status": "healthy"}

@app.get("/api/health")
def health():
    uptime_seconds = int(time.time() - START_TIME)
    return {
        "status": "healthy",
        "uptime_seconds": uptime_seconds,
        "decks": len(DECKS),
        "library_count": len(list(MEDIA_DIR.glob("*.*"))),
        "announcements_count": len(ANNOUNCEMENTS),
    }

# ─────────────────────────────────────────
# WEBSOCKETS
# ─────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    # Send current full state on connect
    await websocket.send_json({
        "type": "FULL_STATE",
        "decks": list(DECKS.values()),
        "mic": MIC_STATE,
        "announcements": ANNOUNCEMENTS,
    })
    try:
        while True:
            data = await websocket.receive_text()
            # client can send pings; just ignore
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ─────────────────────────────────────────
# LIBRARY
# ─────────────────────────────────────────
ALLOWED_AUDIO = {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"}

@app.get("/api/library", response_model=List[LibraryItem])
def list_library():
    items = []
    for f in MEDIA_DIR.iterdir():
        if f.suffix.lower() in ALLOWED_AUDIO:
            stat = f.stat()
            items.append(LibraryItem(filename=f.name, size=stat.st_size))
    # Sort newest first
    items.sort(key=lambda x: x.filename)
    return items

@app.post("/api/library/upload")
async def upload_track(file: UploadFile = File(...)):
    if not any(file.filename.lower().endswith(ext) for ext in ALLOWED_AUDIO):
        raise HTTPException(status_code=400, detail="Only audio files are allowed (mp3, wav, ogg, flac, aac, m4a)")
    dest = MEDIA_DIR / file.filename
    with dest.open("wb") as f:
        content = await file.read()
        f.write(content)
    size = dest.stat().st_size
    item = LibraryItem(filename=file.filename, size=size)
    await manager.broadcast({"type": "LIBRARY_UPDATED", "action": "added", "item": item.model_dump()})
    return {"status": "ok", "filename": file.filename, "size": size}

@app.delete("/api/library/{filename}")
async def delete_track(filename: str):
    path = MEDIA_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink()
    # Also clear from any decks that had this track
    for deck in DECKS.values():
        if deck["track"] == filename:
            deck["track"] = None
            deck["is_playing"] = False
            deck["is_paused"] = False
    await manager.broadcast({"type": "LIBRARY_UPDATED", "action": "removed", "filename": filename})
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok"}

@app.get("/api/library/file/{filename}")
async def serve_file(filename: str):
    path = MEDIA_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), media_type="audio/mpeg")

# ─────────────────────────────────────────
# DECKS
# ─────────────────────────────────────────
@app.get("/api/decks")
def get_decks():
    return list(DECKS.values())

@app.put("/api/decks/{deck_id}/name")
async def rename_deck(deck_id: str, req: DeckRenameRequest):
    if deck_id not in DECKS:
        raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["name"] = req.name
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "name": req.name}

@app.post("/api/decks/{deck_id}/load")
async def load_track(deck_id: str, req: PlayRequest):
    if deck_id not in DECKS:
        raise HTTPException(status_code=404, detail="Deck not found")
    track_path = MEDIA_DIR / req.track_id
    if not track_path.exists():
        raise HTTPException(status_code=404, detail="Track not found in library")
    DECKS[deck_id]["track"] = req.track_id
    DECKS[deck_id]["is_playing"] = False
    DECKS[deck_id]["is_paused"] = False
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id, "track": req.track_id}

@app.post("/api/decks/{deck_id}/play")
async def play_deck(deck_id: str):
    global TRACKS_PLAYED
    if deck_id not in DECKS:
        raise HTTPException(status_code=404, detail="Deck not found")
    if not DECKS[deck_id]["track"]:
        raise HTTPException(status_code=400, detail="No track loaded on this deck")
    DECKS[deck_id]["is_playing"] = True
    DECKS[deck_id]["is_paused"] = False
    TRACKS_PLAYED += 1
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/pause")
async def pause_deck(deck_id: str):
    if deck_id not in DECKS:
        raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["is_playing"] = False
    DECKS[deck_id]["is_paused"] = True
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/stop")
async def stop_deck(deck_id: str):
    if deck_id not in DECKS:
        raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["is_playing"] = False
    DECKS[deck_id]["is_paused"] = False
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/volume")
async def set_deck_volume(deck_id: str, req: VolumeRequest):
    if deck_id not in DECKS:
        raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["volume"] = max(0, min(100, req.volume))
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok"}

# ─────────────────────────────────────────
# MIC CONTROL
# ─────────────────────────────────────────
@app.post("/api/mic/on")
async def mic_on(req: MicControlRequest):
    MIC_STATE["active"] = True
    MIC_STATE["targets"] = req.targets
    await manager.broadcast({"type": "MIC_STATUS", "active": True, "targets": req.targets})
    return {"status": "ok"}

@app.post("/api/mic/off")
async def mic_off():
    MIC_STATE["active"] = False
    MIC_STATE["targets"] = []
    await manager.broadcast({"type": "MIC_STATUS", "active": False, "targets": []})
    return {"status": "ok"}

# ─────────────────────────────────────────
# ANNOUNCEMENTS
# ─────────────────────────────────────────
@app.get("/api/announcements")
def list_announcements():
    return ANNOUNCEMENTS

@app.post("/api/announcements/tts")
async def create_tts_announcement(req: TTSRequest):
    try:
        filepath = generate_tts(req.text)
        filename = Path(filepath).name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")
    ann = {
        "id": uuid.uuid4().hex,
        "name": req.name,
        "type": "TTS",
        "filename": filename,
        "targets": req.targets,
        "status": "Scheduled" if getattr(req, 'scheduled_at', None) else "Ready",
        "scheduled_at": getattr(req, 'scheduled_at', None),
        "created_at": datetime.now().isoformat(),
    }
    ANNOUNCEMENTS.append(ann)
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.post("/api/announcements/upload")
async def upload_announcement(
    file: UploadFile = File(...),
    name: str = "Announcement",
    targets: str = "ALL",
    scheduled_at: Optional[str] = None,
):
    if not any(file.filename.lower().endswith(ext) for ext in {".mp3", ".wav", ".ogg"}):
        raise HTTPException(status_code=400, detail="Only audio files are allowed")
    dest = ANNOUNCEMENTS_DIR / file.filename
    with dest.open("wb") as f:
        content = await file.read()
        f.write(content)
    ann = {
        "id": uuid.uuid4().hex,
        "name": name or file.filename,
        "type": "MP3",
        "filename": file.filename,
        "targets": targets.split(",") if isinstance(targets, str) else targets,
        "status": "Scheduled" if scheduled_at else "Ready",
        "scheduled_at": scheduled_at,
        "created_at": datetime.now().isoformat(),
    }
    ANNOUNCEMENTS.append(ann)
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.post("/api/announcements/{ann_id}/play")
async def play_announcement(ann_id: str):
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    ann["status"] = "Played"
    await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok"}

@app.delete("/api/announcements/{ann_id}")
async def delete_announcement(ann_id: str):
    global ANNOUNCEMENTS
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    ANNOUNCEMENTS = [a for a in ANNOUNCEMENTS if a["id"] != ann_id]
    # Remove file if it exists
    for d in [ANNOUNCEMENTS_DIR]:
        p = d / ann["filename"]
        if p.exists():
            p.unlink()
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok"}

# ─────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────
@app.get("/api/settings")
def get_settings():
    return SETTINGS

@app.post("/api/settings")
async def update_settings(req: SettingUpdateRequest):
    SETTINGS.update(req.value)
    await manager.broadcast({"type": "SETTINGS_UPDATED", "settings": SETTINGS})
    return {"status": "ok", "settings": SETTINGS}

# ─────────────────────────────────────────
# STATS
# ─────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    uptime_seconds = int(time.time() - START_TIME)
    hours, rem = divmod(uptime_seconds, 3600)
    mins, secs = divmod(rem, 60)
    playing_decks = sum(1 for d in DECKS.values() if d["is_playing"])
    return {
        "uptime_seconds": uptime_seconds,
        "uptime_display": f"{hours:02d}:{mins:02d}:{secs:02d}",
        "tracks_played": TRACKS_PLAYED,
        "playing_decks": playing_decks,
        "library_count": len(list(MEDIA_DIR.glob("*.*"))),
        "announcements_count": len(ANNOUNCEMENTS),
        "peak_listeners": 0,
        "current_listeners": 0,
    }
