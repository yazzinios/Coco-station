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
    last_played_at: Optional[str] = None  # ISO datetime — set on each play
    created_at: Optional[str] = None

class AnnouncementUpdateRequest(BaseModel):
    name: Optional[str] = None
    targets: Optional[List[str]] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None
    last_played_at: Optional[str] = None  # ISO datetime — set by frontend on each play

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

class MusicScheduleCreateRequest(BaseModel):
    name: str
    deck_id: str                  # 'a' | 'b' | 'c' | 'd' | 'e' | 'f'
    type: str                     # 'track' | 'playlist'
    target_id: str                # filename or playlist UUID
    scheduled_at: str             # ISO datetime string
    loop: bool = False

class MusicSchedule(BaseModel):
    id: str
    name: str
    deck_id: str
    type: str
    target_id: str
    scheduled_at: str
    loop: bool = False
    status: str = 'Scheduled'
    created_at: Optional[str] = None

class RecurringScheduleCreateRequest(BaseModel):
    name: str
    type: str             # 'Announcement'
    announcement_id: Optional[str] = None
    start_time: str       # "HH:MM"
    active_days: List[int] # [0, 1, 2, 3, 4, 5, 6]
    excluded_days: List[str] = []  # ["YYYY-MM-DD", ...]
    fade_duration: int = 5
    music_volume: int = 10
    target_decks: List[str]
    jingle_start: Optional[str] = None
    jingle_end: Optional[str] = None
    multi_tracks: List[str] = []
    repeat_count: int = 1           # how many times to play the announcement
    repeat_interval: int = 0        # minutes between repeats (0 = no repeat)
    enabled: bool = True

class RecurringSchedule(BaseModel):
    id: str
    name: str
    type: str
    announcement_id: Optional[str] = None
    start_time: str
    active_days: List[int]
    excluded_days: List[str] = []
    fade_duration: int = 5
    music_volume: int = 10
    target_decks: List[str]
    jingle_start: Optional[str] = None
    jingle_end: Optional[str] = None
    repeat_count: int = 1
    repeat_interval: int = 0
    enabled: bool = True
    last_run_date: Optional[str] = None
    created_at: Optional[str] = None

# ── Recurring Mixer Schedules (music / playlist on deck) ────────────────────
class RecurringMixerScheduleCreateRequest(BaseModel):
    name: str
    type: str             # 'track' | 'playlist'
    target_id: str        # filename or playlist UUID
    deck_ids: List[str]   # ['a', 'b', ...]
    start_time: str       # "HH:MM"
    stop_time: Optional[str] = None  # "HH:MM" — if set, stops music at this time
    active_days: List[int]
    excluded_days: List[str] = []
    fade_in: int = 3
    fade_out: int = 3
    volume: int = 80
    loop: bool = True
    jingle_start: Optional[str] = None
    jingle_end: Optional[str] = None
    multi_tracks: List[str] = []
    enabled: bool = True

    def model_post_init(self, __context):
        # FIX: coerce empty string to None so the scheduler correctly treats
        # a cleared stop_time field as "no stop time" instead of saving "" to
        # the DB, which would then appear as a set (truthy) stop_time on the card.
        if self.stop_time == '':
            self.stop_time = None

# ── Multi-deck sync schemas ─────────────────────────────────────────────────

class PlaylistBroadcastRequest(BaseModel):
    """Option 1 — load the same playlist on ALL (or selected) decks simultaneously."""
    playlist_id: str
    deck_ids: List[str] = ["a", "b", "c", "d", "e", "f"]   # defaults to all 6
    loop: bool = False

class SyncAllRequest(BaseModel):
    """Option 2 — sync all (or selected) target decks to a running master deck."""
    source_deck: str                                          # e.g. "a"
    target_decks: List[str] = ["b", "c", "d", "e", "f"]     # decks to align to source


class RecurringMixerSchedule(BaseModel):
    id: str
    name: str
    type: str
    target_id: str
    deck_ids: List[str]   # one or more deck ids
    start_time: str
    stop_time: Optional[str] = None
    active_days: List[int]
    excluded_days: List[str] = []
    fade_in: int = 3
    fade_out: int = 3
    volume: int = 80
    loop: bool = True
    jingle_start: Optional[str] = None
    jingle_end: Optional[str] = None
    enabled: bool = True
    last_run_date: Optional[str] = None
    created_at: Optional[str] = None
