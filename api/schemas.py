from pydantic import BaseModel
from typing import List, Optional

class DeckRenameRequest(BaseModel):
    name: str

class VolumeRequest(BaseModel):
    volume: int  # 0-100

class LoopRequest(BaseModel):
    loop: bool = False

class PlayRequest(BaseModel):
    track_id: str  # filename in data/library/

class MicControlRequest(BaseModel):
    targets: List[str]  # e.g. ["a", "b"] or ["ALL"]

class TTSRequest(BaseModel):
    name: str
    text: str
    targets: List[str]
    lang: str = "en"
    scheduled_at: Optional[str] = None

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
    is_loop: bool = False
    playlist_id: Optional[str] = None
    playlist_index: Optional[int] = None
    playlist_loop: bool = False

class Announcement(BaseModel):
    id: str
    name: str
    type: str         # 'TTS' | 'MP3'
    filename: str
    targets: List[str]
    status: str = 'Ready'
    created_at: Optional[str] = None

class Playlist(BaseModel):
    id: str
    name: str
    tracks: List[str] = []

class PlaylistCreateRequest(BaseModel):
    name: str
    tracks: List[str] = []

class PlaylistLoadRequest(BaseModel):
    playlist_id: str
    loop: bool = False
