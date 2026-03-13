import os
import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict

import shutil
from pathlib import Path
from schemas import DeckRenameRequest, VolumeRequest, PlayRequest, MicControlRequest, TTSRequest, SettingUpdateRequest, LibraryItem
from tts import generate_tts
from db_client import db

MEDIA_DIR = Path("data/library")
ANNOUNCEMENTS_DIR = Path("data/announcements")
MEDIA_DIR.mkdir(exist_ok=True)
ANNOUNCEMENTS_DIR.mkdir(exist_ok=True)

# In a real app we'd import auth and dependencies here
# from auth import verify_token, require_admin

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start APScheduler for announcements here
    print("API Server Starting...")
    yield
    # Shutdown
    print("API Server Shutting down...")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "CocoStation API is running", "status": "healthy"}

# -----------------
# WEBSOCKETS
# -----------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We don't expect much from the client, just push state to them
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# -----------------
# DECKS
# -----------------
@app.get("/api/decks")
def get_decks():
    # Return mock/live DB data
    pass

@app.put("/api/decks/{deck_id}/name")
async def rename_deck(deck_id: str, req: DeckRenameRequest):
    # Update DB
    await manager.broadcast({"type": "DECK_RENAME", "deck_id": deck_id, "name": req.name})
    return {"status": "ok", "name": req.name}

# -----------------
# MIXER CONTROL
# -----------------
@app.post("/api/decks/{deck_id}/play")
def play_deck(deck_id: str):
    # Hit ffmpeg-mixer API
    # requests.post(f"http://{os.getenv('FFMPEG_HOST')}:8001/decks/{deck_id}/play")
    pass

@app.post("/api/decks/{deck_id}/volume")
async def set_deck_volume(deck_id: str, req: VolumeRequest):
    # requests.post(f"http://{os.getenv('FFMPEG_HOST')}:8001/decks/{deck_id}/volume/{req.volume}")
    await manager.broadcast({"type": "VOLUME_CHANGE", "deck_id": deck_id, "volume": req.volume})
    return {"status": "ok"}

# -----------------
# MIC TARGETING
# -----------------
@app.post("/api/mic/on")
async def mic_on(req: MicControlRequest):
    # Tell ffmpeg processes to mix mic pipe
    targets = req.targets
    # Duck music volume to fade_percent setting
    await manager.broadcast({"type": "MIC_STATUS", "active": True, "targets": targets})
    return {"status": "ok"}

@app.post("/api/mic/off")
async def mic_off():
    # Tell ffmpeg processes to mute mic pipe
    # Restore music volume
    await manager.broadcast({"type": "MIC_STATUS", "active": False})
    return {"status": "ok"}

# -----------------
# ANNOUNCEMENTS
# -----------------
@app.post("/api/announcements/tts")
def create_tts_announcement(req: TTSRequest):
    filepath = generate_tts(req.text)
    # logic to save to DB and schedule
    return {"status": "ok", "file": filepath}

@app.get("/api/library", response_model=List[LibraryItem])
def list_library():
    items = []
    for f in MEDIA_DIR.glob("*.mp3"):
        stat = f.stat()
        items.append(LibraryItem(filename=f.name, size=stat.st_size))
    return items

@app.post("/api/library/upload")
async def upload_track(file: Request):
    # Simplified upload for now - in production use UploadFile
    pass

@app.get("/api/announcements")
def list_announcements():
    # Mock data for now
    return []

@app.get("/api/health")
def health():
    return {"status": "healthy"}
