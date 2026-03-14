from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class DeckRenameRequest(BaseModel):
    name: str

class VolumeRequest(BaseModel):
    volume: int  # 0-100

class PlayRequest(BaseModel):
    track_id: str  # filename in data/library/

class MicControlRequest(BaseModel):
    targets: List[str]  # e.g. ["a", "b"] or ["ALL"]

class TTSRequest(BaseModel):
    name: str
    text: str
    targets: List[str]
    scheduled_at: Optional[str] = None  # ISO datetime string e.g. "2026-03-14T15:30:00"

class LibraryItem(BaseModel):
    filename: str
    size: int
    duration: Optional[float] = None

class SettingUpdateRequest(BaseModel):
    value: dict

class DeckState(BaseModel):
    id: str
    name: str
    track: Optional[str] = None
    volume: int = 100
    is_playing: bool = False
    is_paused: bool = False

class Announcement(BaseModel):
    id: str
    name: str
    type: str         # 'TTS' | 'MP3'
    filename: str
    targets: List[str]
    status: str = 'Ready'
    created_at: Optional[str] = None
