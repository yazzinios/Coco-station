from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class DeckRenameRequest(BaseModel):
    name: str

class VolumeRequest(BaseModel):
    volume: int

class PlayRequest(BaseModel):
    track_id: str

class MicControlRequest(BaseModel):
    targets: List[str]  # e.g. ["a", "b"] or ["all"]

class TTSRequest(BaseModel):
    name: str
    text: str
    targets: List[str]
    schedule_at: Optional[datetime] = None

class SettingUpdateRequest(BaseModel):
    value: dict
