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
from pydantic import BaseModel as _PydanticBase

from scheduler import (
    ap_scheduler,
    init_scheduler,
    start_scheduler,
    stop_scheduler,
    register_recurring_job,
    register_mixer_job,
    unregister_job,
    get_scheduler_status,
    _trigger_music_schedule,
    _trigger_recurring_mixer_schedule,
    _stop_recurring_mixer_schedule,
    _ap_trigger_recurring,
    _ap_trigger_mixer,
    format_time_left,
)
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
    PlaylistBroadcastRequest, SyncAllRequest,
)
from tts import generate_tts
import announcement_engine as ann_engine
from db_client import db
from auth import verify_token, hash_password, require_permission, require_deck_access, require_admin
from rbac import router as rbac_router
from auth_routes import auth_router, set_auth_settings_ref

# ── Audit log helper ──────────────────────────────────────────
def _audit(request: Request, user: dict, action: str, details: dict = None):
    """Fire-and-forget audit log — never raises."""
    try:
        ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()
        db.log_action(
            user_id  = user.get("sub", "unknown"),
            username = user.get("username", "unknown"),
            action   = action,
            details  = details or {},
            ip       = ip,
        )
    except Exception as e:
        print(f"[audit] log failed: {e}")

MEDIA_DIR         = Path("data/library")
ANNOUNCEMENTS_DIR = Path("data/announcements")
CHIMES_DIR        = Path("data/chimes")
BRANDING_DIR      = Path("data/branding")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
ANNOUNCEMENTS_DIR.mkdir(parents=True, exist_ok=True)
CHIMES_DIR.mkdir(parents=True, exist_ok=True)
BRANDING_DIR.mkdir(parents=True, exist_ok=True)
START_TIME        = time.time()
TRACKS_PLAYED     = 0
CURRENT_LISTENERS = 0
PEAK_LISTENERS    = 0

DECKS: Dict[str, dict] = {
    "a": {"id": "a", "name": "Castle",  "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False, "is_crossfading": False},
    "b": {"id": "b", "name": "Deck B",  "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False, "is_crossfading": False},
    "c": {"id": "c", "name": "Karting", "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False, "is_crossfading": False},
    "d": {"id": "d", "name": "Deck D",  "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False, "is_crossfading": False},
    "e": {"id": "e", "name": "Deck E",  "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False, "is_crossfading": False},
    "f": {"id": "f", "name": "Deck F",  "track": None, "volume": 100, "is_playing": False, "is_paused": False, "is_loop": False, "playlist_id": None, "playlist_index": None, "playlist_loop": False, "is_crossfading": False},
}
ANNOUNCEMENTS: List[dict] = []
SETTINGS: dict = {
    "ducking_percent": 5,
    "mic_ducking_percent": 5,
    "db_mode": "local",
    "jingle_intro": None,    # filename in /data/chimes/ — plays before every feed
    "jingle_outro": None,    # filename in /data/chimes/ — plays after every feed
    "company_name": "",      # station / company display name
    "company_logo": None,    # filename in /data/branding/ (set on upload)
    "timezone": "Africa/Casablanca",
    "session_hours": 8,
    # LDAP
    "ldap_enabled":        False,
    "ldap_server":         "",
    "ldap_port":           389,
    "ldap_base_dn":        "",
    "ldap_bind_dn":        "",
    "ldap_bind_pw":        "",
    "ldap_user_filter":    "(sAMAccountName={username})",
    "ldap_attr_name":      "cn",
    "ldap_attr_email":     "mail",
    "ldap_role_admin_group":        "",
    "ldap_role_super_admin_group":   "",
    "ldap_role_operator_group":      "",
    "ldap_role_viewer_group":        "",
    "ldap_role_custom_groups":       [],
    "ldap_use_ssl":        False,
    "ldap_tls_verify":     True,
}
MIC_STATE: dict = {"active": False, "targets": []}

_DUCK_REFCOUNT_REF: List[int] = [0]
_DUCK_SAVED_VOLUMES: Dict[str, int] = {}
_DUCK_CURRENT_TYPE_REF: List[Optional[str]] = [None]
_TRIGGER_LOCK_REF: List[asyncio.Lock] = [asyncio.Lock()]
_ANNOUNCEMENT_EVENTS: Dict[str, asyncio.Event] = {}
PLAYLISTS: Dict[str, dict] = {}
DECK_PLAYLISTS: Dict[str, Optional[dict]] = {"a": None, "b": None, "c": None, "d": None, "e": None, "f": None}
MUSIC_SCHEDULES: List[dict] = []
RECURRING_SCHEDULES: List[dict] = []
RECURRING_MIXER_SCHEDULES: List[dict] = []
MUSIC_REQUESTS: List[dict] = []


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


def _safe_settings(settings: dict) -> dict:
    """Return a copy of SETTINGS with sensitive credentials scrubbed.
    Called before every SETTINGS_UPDATED broadcast so secrets never reach clients.
    """
    SENSITIVE_KEYS = {"ldap_bind_pw"}
    return {k: ("" if k in SENSITIVE_KEYS else v) for k, v in settings.items()}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ANNOUNCEMENTS, PLAYLISTS, SETTINGS, MUSIC_SCHEDULES, RECURRING_SCHEDULES, RECURRING_MIXER_SCHEDULES, MUSIC_REQUESTS
    print("CocoStation API Starting...")
    loop = asyncio.get_running_loop()

    now = datetime.now()
    utcnow = datetime.utcnow()
    print("----------------------------------------------------------------")
    print(f"[startup] Local system time: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[startup] UTC system time:   {utcnow.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[startup] FFMPEG_URL:        {FFMPEG_URL}")
    print(f"[startup] MEDIAMTX_API:      {MEDIAMTX_API}")
    print("----------------------------------------------------------------")

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
        for rs in RECURRING_SCHEDULES:
            rs["last_run_date"] = None
        print(f"[startup] Loaded {len(RECURRING_SCHEDULES)} recurring schedule(s) from DB.")
    except Exception as e:
        print(f"[startup] Failed to load recurring schedules: {e}")

    try:
        RECURRING_MIXER_SCHEDULES = await loop.run_in_executor(None, db.get_recurring_mixer_schedules)
        for rs in RECURRING_MIXER_SCHEDULES:
            rs["last_run_date"] = None
        print(f"[startup] Loaded {len(RECURRING_MIXER_SCHEDULES)} recurring mixer schedule(s) from DB.")
    except Exception as e:
        print(f"[startup] Failed to load recurring mixer schedules: {e}")

    # FIX (Bug 9): Load persisted music requests so they survive restarts
    try:
        MUSIC_REQUESTS = await loop.run_in_executor(None, db.get_music_requests)
        print(f"[startup] Loaded {len(MUSIC_REQUESTS)} music request(s) from DB.")
    except Exception as e:
        print(f"[startup] Failed to load music requests: {e}")

    state = {
        "decks": DECKS,
        "deck_playlists": DECK_PLAYLISTS,
        "announcements": ANNOUNCEMENTS,
        "music_schedules": MUSIC_SCHEDULES,
        "recurring_schedules": RECURRING_SCHEDULES,
        "recurring_mixer_schedules": RECURRING_MIXER_SCHEDULES,
        "playlists": PLAYLISTS,
        "settings": SETTINGS,
        "manager": manager,
        "ffmpeg_url": FFMPEG_URL,
        "media_dir": MEDIA_DIR,
        "announcements_dir": ANNOUNCEMENTS_DIR,
        "fade_and_play_announcement": fade_and_play_announcement,
        "mic_on": mic_on,
        "db": db,
        "trigger_lock_ref": _TRIGGER_LOCK_REF,
        "duck_refcount_ref": _DUCK_REFCOUNT_REF,
        "duck_saved_volumes": _DUCK_SAVED_VOLUMES,
        "duck_type_ref": _DUCK_CURRENT_TYPE_REF,
    }
    init_scheduler(state)
    start_scheduler(RECURRING_SCHEDULES, RECURRING_MIXER_SCHEDULES)

    ann_engine.init(
        ffmpeg_url=FFMPEG_URL,
        chimes_dir=CHIMES_DIR,
        settings=SETTINGS,
        decks=DECKS,
        announcement_events=_ANNOUNCEMENT_EVENTS,
        trigger_lock=_TRIGGER_LOCK_REF[0],
    )

    # --- JINGLE VALIDATION & AUTO-DISCOVERY ---
    # 1. If DB has a filename but the file is missing on disk → clear the stale setting
    # 2. If DB has no filename → scan disk in case a file was manually added
    for jt in ["intro", "outro"]:
        key = f"jingle_{jt}"
        stored = SETTINGS.get(key)
        if stored:
            if not (CHIMES_DIR / stored).exists():
                print(f"[startup] Jingle '{stored}' referenced in DB but missing on disk — clearing stale setting.")
                SETTINGS[key] = None
                try:
                    await loop.run_in_executor(None, db.save_settings, {key: None})
                except Exception as e:
                    print(f"[startup] Failed to clear stale jingle setting: {e}")
            else:
                print(f"[startup] {jt} jingle OK: {stored}")
        else:
            # Auto-discover only when no setting is stored
            for ext in [".mp3", ".wav", ".ogg"]:
                candidate = f"global_jingle_{jt}{ext}"
                if (CHIMES_DIR / candidate).exists():
                    SETTINGS[key] = candidate
                    print(f"[startup] Auto-discovered {jt} jingle: {candidate}")
                    try:
                        await loop.run_in_executor(None, db.save_settings, {key: candidate})
                    except Exception as e:
                        print(f"[startup] Failed to persist auto-discovered jingle: {e}")
                    break

    set_auth_settings_ref(SETTINGS)

    # ── Background listener poller (MediaMTX every 10 s) ──────────────────────
    async def _poll_listeners():
        global CURRENT_LISTENERS, PEAK_LISTENERS
        while True:
            try:
                async with httpx.AsyncClient(timeout=5) as c:
                    resp = await c.get(f"{MEDIAMTX_API}/v3/paths/list")
                    if resp.status_code == 200:
                        total = 0
                        for item in resp.json().get("items", []):
                            readers = item.get("readers", [])
                            total += len(readers) if isinstance(readers, list) else item.get("readersCount", 0)
                        CURRENT_LISTENERS = total
                        if total > PEAK_LISTENERS:
                            PEAK_LISTENERS = total
            except Exception:
                pass
            await asyncio.sleep(10)
    asyncio.create_task(_poll_listeners())

    yield
    stop_scheduler()

app = FastAPI(lifespan=lifespan, title="CocoStation API")

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth router (login, refresh, me, logout, ldap/test, ldap/save) ──────────
app.include_router(auth_router)

# ── RBAC router (roles, extended user creation, permission catalogue) ────────
app.include_router(rbac_router)


# ═══════════════════════════════════════════════════════════
#  NOTE: set_auth_settings_ref(SETTINGS) is called inside
#  lifespan() after DB settings are loaded — see above.
# ═══════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════
#  COMPANY BRANDING ENDPOINTS  (logo upload / serve / delete)
# ═══════════════════════════════════════════════════════════

ALLOWED_LOGO_EXTS  = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
LOGO_MIME_MAP = {
    ".png":  "image/png",  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif":  "image/gif",  ".svg": "image/svg+xml", ".webp": "image/webp",
}


@app.get("/api/settings/company/logo")
@app.head("/api/settings/company/logo")
async def get_company_logo(request: Request = None):
    """Serve the company logo. Reads base64 data-URI from DB and streams it as an image.
    No auth required — used directly as <img src=...>.
    """
    from fastapi.responses import Response
    import base64
    try:
        branding = await asyncio.get_running_loop().run_in_executor(None, db.get_branding)
        logo_data = branding.get("logo_data")
        logo_mime = branding.get("logo_mime") or "image/png"
        if not logo_data:
            raise HTTPException(status_code=404, detail="No company logo uploaded")
        # HEAD request — return headers only, no body
        if request and request.method == "HEAD":
            return Response(status_code=200, media_type=logo_mime)
        # logo_data is stored as  "data:image/png;base64,XXXX"
        if "," in logo_data:
            raw_b64 = logo_data.split(",", 1)[1]
        else:
            raw_b64 = logo_data
        image_bytes = base64.b64decode(raw_b64)
        return Response(content=image_bytes, media_type=logo_mime)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[branding] get_company_logo failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to load logo")


@app.post("/api/settings/company/logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    _user=Depends(verify_token),
):
    """Upload (replace) the company logo.
    Stored as a base64 data-URI in the company_branding DB table.
    Also written to data/branding/ on disk as a backup.
    """
    import base64
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_LOGO_EXTS:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, GIF, SVG, WEBP allowed")

    content  = await file.read()
    mime     = LOGO_MIME_MAP.get(suffix, "image/png")
    b64_data = "data:" + mime + ";base64," + base64.b64encode(content).decode()

    # 1. Save to DB (primary storage — survives volume wipes)
    try:
        await asyncio.get_running_loop().run_in_executor(
            None, db.save_branding, None, b64_data, mime, len(content)
        )
        print(f"[branding] Logo saved to DB: {file.filename} ({len(content)} bytes, {mime})")
    except Exception as e:
        print(f"[DB] Failed to save branding logo: {e}")
        raise HTTPException(status_code=500, detail="DB write failed")

    # 2. Also write to disk as fallback
    try:
        dest = BRANDING_DIR / f"company_logo{suffix}"
        # Remove any old logo with different extension
        for ext in ALLOWED_LOGO_EXTS:
            old = BRANDING_DIR / f"company_logo{ext}"
            if old.exists() and old != dest:
                old.unlink(missing_ok=True)
        await asyncio.get_running_loop().run_in_executor(None, dest.write_bytes, content)
    except Exception as e:
        print(f"[branding] Disk write failed (non-fatal): {e}")

    # 3. Update settings flag so frontend knows logo exists
    SETTINGS["company_logo"] = f"company_logo{suffix}"
    try:
        await asyncio.get_running_loop().run_in_executor(
            None, db.save_settings, {"company_logo": f"company_logo{suffix}"}
        )
    except Exception as e:
        print(f"[DB] Failed to save company_logo setting: {e}")

    await manager.broadcast({"type": "SETTINGS_UPDATED", "settings": _safe_settings(SETTINGS)})
    return {"status": "ok", "filename": f"company_logo{suffix}", "mime": mime, "size": len(content)}


@app.delete("/api/settings/company/logo")
async def delete_company_logo(_user=Depends(verify_token)):
    """Delete the company logo from DB and disk."""
    # 1. Clear from DB
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.clear_branding_logo)
    except Exception as e:
        print(f"[DB] Failed to clear branding logo: {e}")
    # 2. Clear from disk
    for ext in ALLOWED_LOGO_EXTS:
        p = BRANDING_DIR / f"company_logo{ext}"
        if p.exists():
            p.unlink(missing_ok=True)
    # 3. Clear setting
    SETTINGS["company_logo"] = None
    try:
        await asyncio.get_running_loop().run_in_executor(
            None, db.save_settings, {"company_logo": None}
        )
    except Exception as e:
        print(f"[DB] Failed to clear company_logo setting: {e}")
    await manager.broadcast({"type": "SETTINGS_UPDATED", "settings": _safe_settings(SETTINGS)})
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════
#  GLOBAL JINGLE ENDPOINTS  (intro + outro)
# ═══════════════════════════════════════════════════════════

ALLOWED_JINGLE_EXTS = {".mp3", ".wav", ".ogg"}

@app.get("/api/settings/jingles/status")
def jingle_status():
    """Return which jingle files are configured and present."""
    intro_file = SETTINGS.get("jingle_intro")
    outro_file = SETTINGS.get("jingle_outro")
    return {
        "intro": {
            "filename": intro_file,
            "exists": bool(intro_file and (CHIMES_DIR / intro_file).exists()),
        },
        "outro": {
            "filename": outro_file,
            "exists": bool(outro_file and (CHIMES_DIR / outro_file).exists()),
        },
    }

@app.get("/api/chimes")
async def list_chimes(_user=Depends(verify_token)):
    """Return all chimes from the library (DB-backed)."""
    try:
        chimes = await asyncio.get_running_loop().run_in_executor(None, db.list_chimes)
        return {"chimes": chimes}
    except Exception as e:
        print(f"[chimes] list failed: {e}")
        return {"chimes": []}

@app.post("/api/settings/jingles/{jingle_type}/upload")
async def upload_jingle(
    jingle_type: str,
    file: UploadFile = File(...),
    _user=Depends(verify_token),
):
    """Upload intro or outro jingle. Saved to /data/chimes/ AND registered in the chimes library DB table."""
    if jingle_type not in ("intro", "outro"):
        raise HTTPException(status_code=400, detail="jingle_type must be 'intro' or 'outro'")
    if not any(file.filename.lower().endswith(e) for e in ALLOWED_JINGLE_EXTS):
        raise HTTPException(status_code=400, detail="Only MP3, WAV, OGG allowed")

    safe_name = f"global_jingle_{jingle_type}{Path(file.filename).suffix.lower()}"
    dest = CHIMES_DIR / safe_name
    content = await file.read()
    await asyncio.get_running_loop().run_in_executor(None, dest.write_bytes, content)

    # 1. Update the active-jingle setting (used by the player at runtime)
    settings_key = f"jingle_{jingle_type}"
    SETTINGS[settings_key] = safe_name
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_settings, {settings_key: safe_name})
    except Exception as e:
        print(f"[DB] Failed to save jingle setting: {e}")

    # 2. Upsert into chimes library table so the file is tracked like a library track
    chime_id = f"jingle_{jingle_type}"  # stable ID — one row per intro/outro slot
    chime_row = {
        "id":       chime_id,
        "name":     file.filename,
        "filename": safe_name,
        "size":     len(content),
        "duration": None,
        "type":     jingle_type,
    }
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_chime, chime_row)
        print(f"[chimes] Saved chime to DB: {chime_row}")
    except Exception as e:
        print(f"[DB] Failed to save chime row: {e}")

    if dest.exists():
        print(f"[jingle] Uploaded {jingle_type} jingle: {safe_name} ({len(content)} bytes)")
    else:
        print(f"[jingle] ERROR: {jingle_type} jingle file not found on disk after write: {safe_name}")

    await manager.broadcast({"type": "SETTINGS_UPDATED", "settings": _safe_settings(SETTINGS)})
    return {"status": "ok", "jingle_type": jingle_type, "filename": safe_name}

@app.delete("/api/settings/jingles/{jingle_type}")
async def delete_jingle(jingle_type: str, _user=Depends(verify_token)):
    if jingle_type not in ("intro", "outro"):
        raise HTTPException(status_code=400, detail="jingle_type must be 'intro' or 'outro'")
    settings_key = f"jingle_{jingle_type}"
    filename = SETTINGS.get(settings_key)
    if filename:
        path = CHIMES_DIR / filename
        if path.exists():
            path.unlink()
    SETTINGS[settings_key] = None
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_settings, {settings_key: None})
    except Exception as e:
        print(f"[DB] Failed to clear jingle setting: {e}")
    # Remove from chimes library table too
    chime_id = f"jingle_{jingle_type}"
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.delete_chime, chime_id)
    except Exception as e:
        print(f"[DB] Failed to delete chime row: {e}")
    await manager.broadcast({"type": "SETTINGS_UPDATED", "settings": _safe_settings(SETTINGS)})
    return {"status": "ok", "jingle_type": jingle_type}


# ═══════════════════════════════════════════════════════════
#  GLOBAL JINGLE PLAYER
# ═══════════════════════════════════════════════════════════

async def _play_global_jingle(jingle_type: str, deck_ids: list) -> None:
    """Play the globally-configured intro or outro jingle on the given decks.
    Blocks until the jingle finishes (so the caller's sequence stays in order).
    """
    filename = SETTINGS.get(f"jingle_{jingle_type}")
    if not filename:
        return
    path = CHIMES_DIR / filename
    if not path.exists():
        # Only log once to avoid spamming the console
        if not hasattr(_play_global_jingle, "_missing_logged"):
            _play_global_jingle._missing_logged = set()
        if filename not in _play_global_jingle._missing_logged:
            print(f"[jingle] {jingle_type} file not found on disk: {path}")
            _play_global_jingle._missing_logged.add(filename)
        return


    # docker-compose mounts ./data/chimes → /chimes inside the mixer container
    # The API container sees the file at data/chimes/<name> (for ffprobe)
    # The mixer container must receive /chimes/<name>  (NOT /data/chimes/<name>)
    filepath = f"/chimes/{filename}"
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            tasks = [
                c.post(
                    f"{FFMPEG_URL}/decks/{did}/play_announcement",
                    json={"filepath": filepath, "notify": False},
                )
                for did in deck_ids
            ]
            resps = await asyncio.gather(*tasks, return_exceptions=True)
            for did, r in zip(deck_ids, resps):
                if isinstance(r, Exception):
                    print(f"[jingle] Connection error to mixer for deck {did}: {r}")
                elif r.status_code != 200:
                    print(f"[jingle] Mixer error {r.status_code} for deck {did}: {r.text}")


        duration = await get_audio_duration(path)
        print(f"[jingle] {jingle_type} playing ({filename}, {duration}s)")
        await asyncio.sleep(min(duration + 0.1, 30.0))
    except Exception as e:
        print(f"[jingle] {jingle_type} play error on {deck_ids}: {e}")


# ═══════════════════════════════════════════════════════════
#  AUDIO HELPERS
# ═══════════════════════════════════════════════════════════

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
    async with httpx.AsyncClient(timeout=2) as c:
        for _ in range(steps):
            current += delta
            vol = max(0, min(100, round(current)))
            tasks = [c.post(f"{FFMPEG_URL}/decks/{did}/volume/{vol}") for did in deck_ids]
            await asyncio.gather(*tasks, return_exceptions=True)
            await asyncio.sleep(delay)
        # Final step ensures precision
        tasks = [c.post(f"{FFMPEG_URL}/decks/{did}/volume/{to_pct}") for did in deck_ids]
        await asyncio.gather(*tasks, return_exceptions=True)

async def _restore_volumes(deck_ids: list, duck_pct: int, target_volumes: Optional[Dict[str, int]] = None):
    async with httpx.AsyncClient(timeout=3) as c:
        steps    = FADE_STEPS
        delay    = FADE_IN_STEP_MS / 1000.0
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
        final_tasks = []
        for did in deck_ids:
            target = per_deck.get(did, 100)
            DECKS[did]["volume"] = target
            final_tasks.append(c.post(f"{FFMPEG_URL}/decks/{did}/volume/{target}"))
        await asyncio.gather(*final_tasks, return_exceptions=True)


# ═══════════════════════════════════════════════════════════
#  DUCKING ENGINE
# ═══════════════════════════════════════════════════════════

async def _duck_acquire(source_type: str = "announcement", level: int = None) -> None:
    _DUCK_REFCOUNT_REF[0] += 1
    _DUCK_CURRENT_TYPE_REF[0] = source_type
    print(f"[duck] acquire ({source_type}) → refcount={_DUCK_REFCOUNT_REF[0]}")

    if level is not None:
        duck_pct = level
    elif source_type == "mic":
        duck_pct = _duck_level(SETTINGS.get("mic_ducking_percent"), 5)
    else:
        duck_pct = _duck_level(SETTINGS.get("ducking_percent"), 5)

    all_playing = [did for did in DECKS if DECKS[did].get("is_playing")]

    if _DUCK_REFCOUNT_REF[0] == 1:
        # First acquirer: snapshot current volumes atomically before fading.
        # Build the snapshot first, then replace in one step so a concurrent
        # second acquire cannot observe a half-cleared dict.
        snapshot = {did: DECKS[did]["volume"] for did in all_playing}
        _DUCK_SAVED_VOLUMES.clear()
        _DUCK_SAVED_VOLUMES.update(snapshot)
        if all_playing:
            from_vol = max(snapshot.values()) if snapshot else 100
            await _fade_volumes(all_playing, from_vol, duck_pct, FADE_STEP_MS)
            for did in all_playing:
                DECKS[did]["volume"] = duck_pct
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    else:
        # Subsequent acquirer: do NOT touch _DUCK_SAVED_VOLUMES — the first
        # acquirer owns it and will restore from it on final release.
        # Just ensure all playing decks are at the duck level right now.
        if all_playing:
            async with httpx.AsyncClient(timeout=3) as c:
                await asyncio.gather(
                    *[c.post(f"{FFMPEG_URL}/decks/{did}/volume/{duck_pct}") for did in all_playing],
                    return_exceptions=True,
                )
            for did in all_playing:
                DECKS[did]["volume"] = duck_pct
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})

async def _duck_release(restore_delay_ms: int = 200) -> None:
    if _DUCK_REFCOUNT_REF[0] <= 0: return
    _DUCK_REFCOUNT_REF[0] -= 1
    print(f"[duck] release → refcount={_DUCK_REFCOUNT_REF[0]}")

    if _DUCK_REFCOUNT_REF[0] == 0:
        saved = dict(_DUCK_SAVED_VOLUMES)
        _DUCK_SAVED_VOLUMES.clear()
        duck_pct = _duck_level(SETTINGS.get("ducking_percent"), 5)
        if restore_delay_ms > 0:
            await asyncio.sleep(restore_delay_ms / 1000.0)
        to_restore = [did for did in saved if DECKS.get(did, {}).get("is_playing")]
        if to_restore:
            await _restore_volumes(to_restore, duck_pct, target_volumes=saved)
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})


# ═══════════════════════════════════════════════════════════
#  TRIGGER STATE MACHINE
#  STATE 2: duck → STATE 3: intro jingle → STATE 4: content
#  STATE 5: outro jingle → STATE 6: restore
# ═══════════════════════════════════════════════════════════

async def fade_and_play_announcement(deck_ids: list, filepath: str, level: int = None):
    await ann_engine.play_announcement_sequence(deck_ids, filepath)


async def fade_and_enable_mic(deck_ids: list):
    await ann_engine.mic_open_sequence(deck_ids)


async def fade_restore_after_mic(deck_ids: list):
    await ann_engine.mic_close_sequence(deck_ids)


# ── Health ──────────────────────────────────────────────────
@app.get("/")
async def root(): return {"message": "CocoStation API is running", "status": "healthy"}

@app.get("/api/health")
def health():
    return {"status": "healthy", "uptime_seconds": int(time.time()-START_TIME), "decks": len(DECKS),
            "library_count": len(list(MEDIA_DIR.glob("*.*"))), "announcements_count": len(ANNOUNCEMENTS)}

@app.get("/api/debug/paths")
def debug_paths():
    """Show exactly what files are visible inside the API container.
    Use this to confirm volume mounts are working and files are present.
    curl http://localhost:8000/api/debug/paths
    """
    def _ls(p: Path):
        try:
            return [
                {"name": f.name, "size": f.stat().st_size, "path": str(f)}
                for f in sorted(p.iterdir())
                if f.is_file()
            ]
        except Exception as e:
            return {"error": str(e)}

    return {
        "chimes_dir":        str(CHIMES_DIR.resolve()),
        "chimes_exists":     CHIMES_DIR.exists(),
        "chimes_files":      _ls(CHIMES_DIR),
        "announcements_dir": str(ANNOUNCEMENTS_DIR.resolve()),
        "announcements_files": _ls(ANNOUNCEMENTS_DIR),
        "library_dir":       str(MEDIA_DIR.resolve()),
        "library_files":     _ls(MEDIA_DIR),
        "jingle_intro_setting":  SETTINGS.get("jingle_intro"),
        "jingle_outro_setting":  SETTINGS.get("jingle_outro"),
        "jingle_intro_on_disk":  bool(SETTINGS.get("jingle_intro") and (CHIMES_DIR / SETTINGS["jingle_intro"]).exists()),
        "jingle_outro_on_disk":  bool(SETTINGS.get("jingle_outro") and (CHIMES_DIR / SETTINGS["jingle_outro"]).exists()),
    }

# ── WebSocket ───────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await websocket.send_json({
        "type": "FULL_STATE",
        "decks": list(DECKS.values()),
        "mic": MIC_STATE,
        "announcements": ANNOUNCEMENTS,
        "settings": _safe_settings(SETTINGS),
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
                                deck_ids = ["a","b","c","d","e","f"] if not prev_targets or "ALL" in prev_targets else [t.lower() for t in prev_targets]
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
            deck_ids = ["a","b","c","d","e","f"] if not prev_targets or "ALL" in prev_targets else [t.lower() for t in prev_targets]
            asyncio.create_task(fade_restore_after_mic(deck_ids))

# ── Library ─────────────────────────────────────────────────
ALLOWED_AUDIO = {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"}

@app.get("/api/library/public")
def list_library_public():
    items = [{"filename": f.name} for f in MEDIA_DIR.iterdir() if f.suffix.lower() in ALLOWED_AUDIO]
    return sorted(items, key=lambda x: x["filename"])

@app.get("/api/library", response_model=List[LibraryItem])
def list_library():
    items = [LibraryItem(filename=f.name, size=f.stat().st_size)
             for f in MEDIA_DIR.iterdir() if f.suffix.lower() in ALLOWED_AUDIO]
    return sorted(items, key=lambda x: x.filename)

@app.post("/api/library/upload")
async def upload_track(file: UploadFile = File(...), _user=Depends(require_permission("can_library"))):
    if not any(file.filename.lower().endswith(e) for e in ALLOWED_AUDIO):
        raise HTTPException(status_code=400, detail="Only audio files allowed")
    safe_name = Path(file.filename).name
    dest = MEDIA_DIR / safe_name
    content = await file.read()
    await asyncio.get_running_loop().run_in_executor(None, dest.write_bytes, content)
    item = LibraryItem(filename=safe_name, size=dest.stat().st_size)
    await manager.broadcast({"type": "LIBRARY_UPDATED", "action": "added", "item": item.model_dump()})
    return {"status": "ok", "filename": safe_name, "size": dest.stat().st_size}

@app.delete("/api/library/{filename}")
async def delete_track(filename: str, _user=Depends(require_permission("can_library"))):
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
    # FIX (Bug 3): path traversal guard
    path = (MEDIA_DIR / filename).resolve()
    if MEDIA_DIR.resolve() not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists(): raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), media_type="audio/mpeg")

# ── Decks ───────────────────────────────────────────────────
@app.get("/api/decks")
def get_decks(): return list(DECKS.values())

@app.put("/api/decks/{deck_id}/name")
async def rename_deck(deck_id: str, req: DeckRenameRequest, _user=Depends(require_deck_access("control"))):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["name"] = req.name
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_deck_name, deck_id, req.name)
    except Exception as e:
        print(f"[DB] Failed to persist deck name: {e}")
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "name": req.name}

@app.post("/api/decks/{deck_id}/load")
async def load_track(deck_id: str, req: PlayRequest, request: Request, _user=Depends(require_permission("deck.load_track")), _access=Depends(require_deck_access("control"))):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if not (MEDIA_DIR / req.track_id).exists(): raise HTTPException(status_code=404, detail="Track not found")
    DECKS[deck_id]["track"] = req.track_id
    DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    _audit(request, _user, "deck.load_track", {"deck": deck_id, "track": req.track_id})
    return {"status": "ok", "deck": deck_id, "track": req.track_id}

@app.post("/api/decks/{deck_id}/unload")
async def unload_track(deck_id: str, _user=Depends(require_deck_access("control"))):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if DECKS[deck_id]["is_playing"] or DECKS[deck_id]["is_paused"]:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/stop")
        except Exception: pass
    DECKS[deck_id]["track"] = None; DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}

@app.post("/api/decks/{deck_id}/play")
async def play_deck(deck_id: str, request: Request, _user=Depends(require_permission("deck.play")), _access=Depends(require_deck_access("control"))):
    global TRACKS_PLAYED
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    if not DECKS[deck_id]["track"]: raise HTTPException(status_code=400, detail="No track loaded")
    filepath   = str(Path("/library") / DECKS[deck_id]["track"])
    loop       = DECKS[deck_id].get("is_loop", False)
    is_playing = DECKS[deck_id].get("is_playing", False)
    DECKS[deck_id]["is_playing"] = True; DECKS[deck_id]["is_paused"] = False
    TRACKS_PLAYED += 1
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            if is_playing:
                # Deck already has audio running — crossfade into the new track
                DECKS[deck_id]["is_crossfading"] = True
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/crossfade",
                             json={"filepath": filepath, "loop": loop})
                async def _clear_xfade(did=deck_id):
                    await asyncio.sleep(3.5)
                    DECKS[did]["is_crossfading"] = False
                    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
                asyncio.create_task(_clear_xfade())
            else:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play",
                             json={"filepath": filepath, "loop": loop})
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    _audit(request, _user, "deck.play", {"deck": deck_id, "track": DECKS[deck_id].get("track"), "crossfade": is_playing})
    return {"status": "ok", "deck": deck_id, "crossfade": is_playing}

@app.post("/api/decks/{deck_id}/pause")
async def pause_deck(deck_id: str, _user=Depends(require_permission("deck.pause")), _access=Depends(require_deck_access("control"))):
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
async def stop_deck(deck_id: str, _user=Depends(require_permission("deck.stop")), _access=Depends(require_deck_access("control"))):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/decks/{deck_id}/stop")
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id}


class DeckCloneRequest(_PydanticBase):
    source_deck: str   # e.g. "a"
    target_deck: str   # e.g. "b"


@app.post("/api/decks/clone")
async def clone_deck(req: DeckCloneRequest, request: Request,
                     _user=Depends(require_permission("deck.play"))):
    """Start the same track on target_deck at the exact same playback position as source_deck.
    Both decks end up playing in sync (within ~1 second of network + ffmpeg seek latency).
    """
    src, tgt = req.source_deck.lower(), req.target_deck.lower()
    if src not in DECKS: raise HTTPException(status_code=404, detail=f"Source deck '{src}' not found")
    if tgt not in DECKS: raise HTTPException(status_code=404, detail=f"Target deck '{tgt}' not found")
    if src == tgt: raise HTTPException(status_code=400, detail="Source and target deck must be different")
    # Manual deck control check (require_deck_access can't be used here — no deck_id path param)
    if not (_user.get("role") == "admin" or _user.get("is_super_admin")):
        from db_client import db as _db
        _perms = _db.get_permissions(_user["sub"])
        _dc = _perms.get("deck_control") or {}
        for _did in (src, tgt):
            if not _dc.get(_did, {}).get("control", False):
                raise HTTPException(status_code=403, detail=f"No control access for Deck {_did.upper()}")

    src_state = DECKS[src]
    if not src_state.get("is_playing") or not src_state.get("track"):
        raise HTTPException(status_code=400, detail=f"Deck {src.upper()} is not currently playing")

    track    = src_state["track"]
    is_loop  = src_state.get("is_loop", False)
    volume   = src_state.get("volume", 100)

    # Use sync_probe: atomically snapshots elapsed + measures ffmpeg startup latency
    # This eliminates the old hardcoded +0.3s guess and compensates for real startup time.
    seek_to = 0.0
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{FFMPEG_URL}/decks/{src}/sync_probe")
            if r.status_code == 200:
                data    = r.json()
                seek_to = float(data.get("seek_to", 0.0))
                print(f"[clone] sync_probe → elapsed={data.get('elapsed')}s "
                      f"startup={data.get('startup_latency')}s seek_to={seek_to}s")
            else:
                print(f"[clone] sync_probe returned {r.status_code} — falling back to /position")
                r2 = await c.get(f"{FFMPEG_URL}/decks/{src}/position")
                if r2.status_code == 200:
                    elapsed = float(r2.json().get("elapsed", 0.0))
                    seek_to = max(0.0, elapsed + 0.3)
    except Exception as e:
        print(f"[clone] Could not get sync_probe from mixer for deck {src}: {e}")

    # Load the track state on target deck
    DECKS[tgt]["track"]      = track
    DECKS[tgt]["is_playing"] = True
    DECKS[tgt]["is_paused"]  = False
    DECKS[tgt]["is_loop"]    = is_loop
    DECKS[tgt]["volume"]     = volume

    filepath = str(Path("/library") / track)
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{tgt}/play",
                         json={"filepath": filepath, "loop": is_loop, "seek_seconds": seek_to})
            await c.post(f"{FFMPEG_URL}/decks/{tgt}/volume/{volume}")
    except Exception as e:
        print(f"[clone] Mixer play failed for deck {tgt}: {e}")

    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    _audit(request, _user, "deck.clone", {"source": src, "target": tgt, "track": track, "seek": seek_to})
    return {"status": "ok", "source": src, "target": tgt, "track": track, "seek_seconds": seek_to}


# ═══════════════════════════════════════════════════════════
#  OPTION 1 — Broadcast same playlist to multiple decks
#  POST /api/decks/playlist/broadcast
#
#  Loads the same playlist on every requested deck and fires
#  all play() calls in a single asyncio.gather so they start
#  within the same event-loop tick (~0 ms apart).
# ═══════════════════════════════════════════════════════════

@app.post("/api/decks/playlist/broadcast")
async def playlist_broadcast(
    req: PlaylistBroadcastRequest,
    request: Request,
    _user=Depends(require_permission("deck.load_playlist")),
):
    """
    Load the same playlist on all requested decks and start them
    simultaneously (single asyncio.gather — no sequential delays).
    """
    playlist = PLAYLISTS.get(req.playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    deck_ids = [d.lower() for d in req.deck_ids if d.lower() in DECKS]
    if not deck_ids:
        raise HTTPException(status_code=400, detail="No valid deck IDs provided")

    tracks = [t for t in playlist["tracks"] if (MEDIA_DIR / t).exists()]
    if not tracks:
        raise HTTPException(status_code=400, detail="No valid tracks in playlist")

    first_track = tracks[0]
    filepath    = str(Path("/library") / first_track)

    # ── 1. Stop any currently playing decks (sequentially is fine — cheap) ──
    async with httpx.AsyncClient(timeout=5) as c:
        stop_tasks = [
            c.post(f"{FFMPEG_URL}/decks/{did}/stop")
            for did in deck_ids
            if DECKS[did].get("is_playing") or DECKS[did].get("is_paused")
        ]
        if stop_tasks:
            await asyncio.gather(*stop_tasks, return_exceptions=True)

    # ── 2. Update in-memory state for all decks ──────────────────────────────
    for did in deck_ids:
        DECK_PLAYLISTS[did] = {
            "playlist_id": req.playlist_id,
            "tracks": tracks,
            "index": 0,
            "loop": req.loop,
        }
        DECKS[did].update({
            "track":          first_track,
            "is_playing":     True,
            "is_paused":      False,
            "is_loop":        False,
            "playlist_id":    req.playlist_id,
            "playlist_index": 0,
            "playlist_loop":  req.loop,
        })

    # ── 3. Fire all play() calls in ONE gather — simultaneous start ──────────
    async with httpx.AsyncClient(timeout=5) as c:
        play_tasks = [
            c.post(
                f"{FFMPEG_URL}/decks/{did}/play",
                json={"filepath": filepath, "loop": False, "seek_seconds": 0.0},
            )
            for did in deck_ids
        ]
        results = await asyncio.gather(*play_tasks, return_exceptions=True)

    errors = [
        {"deck": did, "error": str(err)}
        for did, err in zip(deck_ids, results)
        if isinstance(err, Exception)
    ]

    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    _audit(request, _user, "deck.playlist_broadcast",
           {"playlist": playlist["name"], "decks": deck_ids, "tracks": len(tracks)})

    return {
        "status":      "ok" if not errors else "partial",
        "playlist":    playlist["name"],
        "decks":       deck_ids,
        "first_track": first_track,
        "track_count": len(tracks),
        "errors":      errors,
    }


# ═══════════════════════════════════════════════════════════
#  OPTION 2 — Sync all target decks to a running master deck
#  POST /api/decks/sync-all
#
#  1. sync_probe the source deck  →  get elapsed + startup latency
#  2. compute seek_to = elapsed + startup_latency
#  3. fire all target play() calls in ONE gather with that seek
#
#  Result: every target deck jumps to the exact same audio
#  position as the source and plays in lockstep.
# ═══════════════════════════════════════════════════════════

@app.post("/api/decks/sync-all")
async def sync_all_to_source(
    req: SyncAllRequest,
    request: Request,
    _user=Depends(require_permission("deck.play")),
):
    """
    Sync all target decks to the exact playback position of the source deck.
    Source must already be playing.  All targets start in parallel.
    """
    src = req.source_deck.lower()
    if src not in DECKS:
        raise HTTPException(status_code=404, detail=f"Source deck '{src}' not found")
    if not DECKS[src].get("is_playing") or not DECKS[src].get("track"):
        raise HTTPException(status_code=400, detail=f"Deck {src.upper()} is not currently playing")

    target_ids = [d.lower() for d in req.target_decks if d.lower() in DECKS and d.lower() != src]
    if not target_ids:
        raise HTTPException(status_code=400, detail="No valid target decks provided")

    track   = DECKS[src]["track"]
    is_loop = DECKS[src].get("is_loop", False)
    volume  = DECKS[src].get("volume", 100)

    # ── 1. Single sync_probe call on the source ──────────────────────────────
    seek_to        = 0.0
    startup_latency = 0.0
    elapsed        = 0.0
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{FFMPEG_URL}/decks/{src}/sync_probe")
            if r.status_code == 200:
                data           = r.json()
                seek_to        = float(data.get("seek_to", 0.0))
                elapsed        = float(data.get("elapsed", 0.0))
                startup_latency = float(data.get("startup_latency", 0.0))
                print(
                    f"[sync-all] source={src} elapsed={elapsed:.3f}s "
                    f"startup={startup_latency:.3f}s seek_to={seek_to:.3f}s "
                    f"targets={target_ids}"
                )
            else:
                # Fallback: /position + hardcoded latency estimate
                r2 = await c.get(f"{FFMPEG_URL}/decks/{src}/position")
                if r2.status_code == 200:
                    elapsed = float(r2.json().get("elapsed", 0.0))
                    seek_to = max(0.0, elapsed + 0.3)
    except Exception as e:
        print(f"[sync-all] sync_probe failed for deck {src}: {e}")

    filepath = str(Path("/library") / track)

    # ── 2. Update in-memory state for every target deck ──────────────────────
    for did in target_ids:
        DECKS[did].update({
            "track":      track,
            "is_playing": True,
            "is_paused":  False,
            "is_loop":    is_loop,
            "volume":     volume,
        })
        # If source is running a playlist, mirror that playlist state too
        src_pl = DECK_PLAYLISTS.get(src)
        if src_pl:
            DECK_PLAYLISTS[did] = {
                "playlist_id": src_pl["playlist_id"],
                "tracks":      src_pl["tracks"],
                "index":       src_pl["index"],
                "loop":        src_pl["loop"],
            }
            DECKS[did].update({
                "playlist_id":    src_pl["playlist_id"],
                "playlist_index": src_pl["index"],
                "playlist_loop":  src_pl["loop"],
            })

    # ── 3. Fire play + volume for every target in ONE gather ─────────────────
    async with httpx.AsyncClient(timeout=5) as c:
        tasks = []
        for did in target_ids:
            tasks.append(
                c.post(
                    f"{FFMPEG_URL}/decks/{did}/play",
                    json={"filepath": filepath, "loop": is_loop, "seek_seconds": seek_to},
                )
            )
            tasks.append(c.post(f"{FFMPEG_URL}/decks/{did}/volume/{volume}"))
        results = await asyncio.gather(*tasks, return_exceptions=True)

    errors = [
        {"error": str(r)}
        for r in results
        if isinstance(r, Exception)
    ]

    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    _audit(request, _user, "deck.sync_all",
           {"source": src, "targets": target_ids, "track": track, "seek": seek_to})

    return {
        "status":       "ok" if not errors else "partial",
        "source":       src,
        "targets":      target_ids,
        "track":        track,
        "seek_seconds": round(seek_to, 3),
        "elapsed":      round(elapsed, 3),
        "startup_comp": round(startup_latency, 3),
        "errors":       errors,
    }


@app.post("/api/decks/{deck_id}/loop")
async def set_loop(deck_id: str, req: LoopRequest, _user=Depends(require_deck_access("control"))):
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
async def set_deck_volume(deck_id: str, req: VolumeRequest, _user=Depends(require_permission("deck.volume")), _access=Depends(require_deck_access("control"))):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    vol = max(0, min(100, req.volume))
    if _DUCK_REFCOUNT_REF[0] > 0:
        _DUCK_SAVED_VOLUMES[deck_id] = vol
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
async def mic_on(req: MicControlRequest, _user=Depends(require_permission("can_announce"))):
    if _TRIGGER_LOCK_REF[0].locked():
        raise HTTPException(status_code=409, detail="Another trigger is active — please wait")
    deck_ids = ["a","b","c","d","e","f"] if "ALL" in req.targets else [t.lower() for t in req.targets]
    await fade_and_enable_mic(deck_ids)
    MIC_STATE["active"] = True; MIC_STATE["targets"] = req.targets
    await manager.broadcast({"type": "MIC_STATUS", "active": True, "targets": req.targets})
    return {"status": "ok"}

@app.post("/api/mic/off")
async def mic_off(_user=Depends(require_permission("can_announce"))):
    prev_targets = list(MIC_STATE.get("targets", []))
    MIC_STATE["active"] = False; MIC_STATE["targets"] = []
    try:
        async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/mic/off")
    except Exception: pass
    await manager.broadcast({"type": "MIC_STATUS", "active": False, "targets": []})
    deck_ids = ["a","b","c","d","e","f"] if not prev_targets or "ALL" in prev_targets else [t.lower() for t in prev_targets]
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
async def create_tts_announcement(req: TTSRequest, _user=Depends(require_permission("can_announce"))):
    try:
        filepath = await generate_tts(req.text, lang=getattr(req, 'lang', 'en'))
        filename = Path(filepath).name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {e}")
    ann_id = str(uuid.uuid4())
    ann = {"id": ann_id, "name": req.name, "type": "TTS", "filename": filename,
           "targets": req.targets, "text": req.text, "lang": req.lang,
           "status": "Scheduled" if getattr(req, 'scheduled_at', None) else "Ready",
           "scheduled_at": getattr(req, 'scheduled_at', None),
           "created_at": datetime.now().isoformat()}
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.create_announcement, ann)
    except Exception as e:
        print(f"[DB] Failed to persist TTS announcement: {e}")
    ANNOUNCEMENTS.insert(0, ann)
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.post("/api/announcements/upload")
async def upload_announcement(file: UploadFile = File(...), name: str = "Announcement",
                               targets: str = "ALL", scheduled_at: Optional[str] = None,
                               _user=Depends(require_permission("can_announce"))):
    if not any(file.filename.lower().endswith(e) for e in {".mp3",".wav",".ogg"}):
        raise HTTPException(status_code=400, detail="Only audio files allowed")
    safe_name = Path(file.filename).name
    dest = ANNOUNCEMENTS_DIR / safe_name
    content = await file.read()
    await asyncio.get_running_loop().run_in_executor(None, dest.write_bytes, content)
    ann_id = str(uuid.uuid4())
    norm_targets = targets.split(",") if isinstance(targets, str) else list(targets)
    ann = {"id": ann_id, "name": name or safe_name, "type": "MP3", "filename": safe_name,
           "targets": norm_targets,
           "status": "Scheduled" if scheduled_at else "Ready",
           "scheduled_at": scheduled_at, "created_at": datetime.now().isoformat()}
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.create_announcement, ann)
    except Exception as e:
        print(f"[DB] Failed to persist MP3 announcement: {e}")
    ANNOUNCEMENTS.insert(0, ann)
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.post("/api/announcements/{ann_id}/play")
async def play_announcement(ann_id: str, _user=Depends(require_permission("can_announce"))):
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann: raise HTTPException(status_code=404, detail="Not found")
    if _TRIGGER_LOCK_REF[0].locked():
        raise HTTPException(status_code=409, detail="Another trigger is active — please wait")
    ann["status"] = "Played"
    filepath = str(Path("/announcements") / ann["filename"])
    deck_ids = ["a","b","c","d","e","f"] if "ALL" in ann.get("targets",["ALL"]) else [t.lower() for t in ann.get("targets",[])]
    asyncio.create_task(fade_and_play_announcement(deck_ids, filepath))
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.update_announcement_status, ann_id, "Played")
    except Exception: pass
    await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok"}


@app.post("/api/announcements/{ann_id}/play-sync")
async def play_announcement_sync(ann_id: str, _user=Depends(require_permission("can_announce"))):
    """
    Synchronized announcement play — all target decks receive audio at exactly
    the same time by:
      1. Fading all active decks down simultaneously (single asyncio.gather).
      2. Firing play_announcement to every target deck in one gather call.
         No sequential loops, no per-deck await — all HTTP calls sent in parallel.
      3. Fading volumes back up in parallel after audio ends.

    This eliminates the inter-deck delay caused by sequential HTTP round-trips.
    """
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann:
        raise HTTPException(status_code=404, detail="Not found")
    if _TRIGGER_LOCK_REF[0].locked():
        raise HTTPException(status_code=409, detail="Another trigger is active — please wait")

    ann["status"] = "Played"
    filepath   = str(Path("/announcements") / ann["filename"])
    targets    = ann.get("targets", ["ALL"])
    deck_ids   = ["a","b","c","d","e","f"] if "ALL" in targets else [t.lower() for t in targets]

    async def _sync_sequence():
        """
        Runs the full announcement sequence with all decks fired in parallel.
        Uses ann_engine for the fade + jingle logic (already parallel),
        but we call play_announcement_sequence which handles everything correctly.
        The key fix: ann_engine._play_content already uses asyncio.gather
        so all decks get audio simultaneously.
        """
        await ann_engine.play_announcement_sequence(deck_ids, filepath)

    asyncio.create_task(_sync_sequence())

    try:
        await asyncio.get_running_loop().run_in_executor(
            None, db.update_announcement_status, ann_id, "Played"
        )
    except Exception:
        pass

    await manager.broadcast({"type": "ANNOUNCEMENT_PLAY", "announcement": ann})
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "sync": True, "decks": deck_ids}

@app.put("/api/announcements/{ann_id}")
async def update_announcement(ann_id: str, req: AnnouncementUpdateRequest, _user=Depends(require_permission("can_announce"))):
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann: raise HTTPException(status_code=404, detail="Not found")
    updates = {}
    if req.name is not None: ann["name"] = req.name; updates["name"] = req.name
    if req.targets is not None: ann["targets"] = req.targets; updates["targets"] = req.targets
    if req.scheduled_at is not None:
        ann["scheduled_at"] = req.scheduled_at or None
        ann["status"] = "Scheduled" if req.scheduled_at else "Ready"
        updates["scheduled_at"] = req.scheduled_at; updates["status"] = ann["status"]
    if req.status is not None: ann["status"] = req.status; updates["status"] = req.status
    if req.last_played_at is not None: ann["last_played_at"] = req.last_played_at; updates["last_played_at"] = req.last_played_at
    if updates:
        try:
            await asyncio.get_running_loop().run_in_executor(None, db.update_announcement, ann_id, updates)
        except Exception: pass
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok", "announcement": ann}

@app.delete("/api/announcements/{ann_id}")
async def delete_announcement(ann_id: str, _user=Depends(require_permission("can_announce"))):
    global ANNOUNCEMENTS
    ann = next((a for a in ANNOUNCEMENTS if a["id"] == ann_id), None)
    if not ann: raise HTTPException(status_code=404, detail="Not found")
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.delete_announcement, ann_id)
    except Exception: pass
    ANNOUNCEMENTS = [a for a in ANNOUNCEMENTS if a["id"] != ann_id]
    p = ANNOUNCEMENTS_DIR / ann["filename"]
    if p.exists(): p.unlink()
    await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": ANNOUNCEMENTS})
    return {"status": "ok"}

# ── Listeners ───────────────────────────────────────────────
@app.get("/api/listeners")
async def get_listeners():
    result = {}
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            resp = await c.get(f"{MEDIAMTX_API}/v3/paths/list")
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("items", []):
                    path_name = item.get("name", "")
                    readers = item.get("readers", [])
                    reader_count = len(readers) if isinstance(readers, list) else item.get("readersCount", 0)
                    result[path_name] = {"path": path_name, "listeners": reader_count,
                                          "ready": item.get("ready", False)}
    except Exception as e:
        print(f"[listeners] Failed to query mediamtx: {e}")
    decks_summary = {}; total = 0
    for deck_id in ["deck-a", "deck-b", "deck-c", "deck-d", "deck-e", "deck-f"]:
        count = sum(info["listeners"] for name, info in result.items() if name.startswith(deck_id))
        decks_summary[deck_id] = count; total += count
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
        await asyncio.get_running_loop().run_in_executor(None, db.save_playlist, playlist)
    except Exception: pass
    await manager.broadcast({"type": "PLAYLISTS_UPDATED", "playlists": list(PLAYLISTS.values())})
    return playlist

@app.put("/api/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, req: PlaylistCreateRequest, _user=Depends(verify_token)):
    if playlist_id not in PLAYLISTS: raise HTTPException(status_code=404, detail="Playlist not found")
    PLAYLISTS[playlist_id].update({"name": req.name, "tracks": req.tracks})
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_playlist, PLAYLISTS[playlist_id])
    except Exception: pass
    await manager.broadcast({"type": "PLAYLISTS_UPDATED", "playlists": list(PLAYLISTS.values())})
    return PLAYLISTS[playlist_id]

@app.delete("/api/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, _user=Depends(verify_token)):
    if playlist_id not in PLAYLISTS: raise HTTPException(status_code=404, detail="Playlist not found")
    del PLAYLISTS[playlist_id]
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.delete_playlist, playlist_id)
    except Exception: pass
    await manager.broadcast({"type": "PLAYLISTS_UPDATED", "playlists": list(PLAYLISTS.values())})
    return {"status": "ok"}

@app.post("/api/decks/{deck_id}/playlist")
async def load_playlist_to_deck(deck_id: str, req: PlaylistLoadRequest, request: Request, _user=Depends(require_permission("deck.load_playlist")), _access=Depends(require_deck_access("control"))):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    playlist = PLAYLISTS.get(req.playlist_id)
    if not playlist: raise HTTPException(status_code=404, detail="Playlist not found")
    tracks = [t for t in playlist["tracks"] if (MEDIA_DIR / t).exists()]
    if not tracks: raise HTTPException(status_code=400, detail="No valid tracks in playlist")
    if DECKS[deck_id]["is_playing"] or DECKS[deck_id]["is_paused"]:
        try:
            async with httpx.AsyncClient(timeout=5) as c: await c.post(f"{FFMPEG_URL}/decks/{deck_id}/stop")
        except Exception: pass
    DECK_PLAYLISTS[deck_id] = {"playlist_id": req.playlist_id, "tracks": tracks, "index": 0, "loop": req.loop}
    DECKS[deck_id].update({"track": tracks[0], "is_playing": True, "is_paused": False, "is_loop": False,
                            "playlist_id": req.playlist_id, "playlist_index": 0, "playlist_loop": req.loop})
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": str(Path("/library") / tracks[0]), "loop": False})
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    _audit(request, _user, "deck.load_playlist", {"deck": deck_id, "playlist": playlist["name"], "tracks": len(tracks)})
    return {"status": "ok", "deck": deck_id, "playlist": playlist["name"], "track": tracks[0]}

@app.post("/api/decks/{deck_id}/dead_air")
async def dead_air(deck_id: str):
    """
    Called by the mixer watchdog when a deck has been silent for DEAD_AIR_SECONDS
    while is_playing=True.  Recovery strategy:
      1. If a playlist is loaded → advance to the next track (crossfade).
      2. If a single-track loop → restart the same track.
      3. Otherwise → mark deck stopped and broadcast so the dashboard alerts.
    """
    if deck_id not in DECKS:
        return {"status": "ignored"}

    print(f"[dead_air] ⚠ Deck {deck_id.upper()} reported dead air — attempting recovery")
    await manager.broadcast({
        "type": "NOTIFICATION",
        "message": f"⚠️ Dead air on Deck {deck_id.upper()} — auto-recovering...",
        "style": "warning",
    })

    playlist_state = DECK_PLAYLISTS.get(deck_id)

    # Case 1: active playlist → skip to next track
    if playlist_state:
        tracks     = playlist_state.get("tracks", [])
        next_index = playlist_state["index"] + 1
        if next_index >= len(tracks):
            next_index = 0 if playlist_state.get("loop") else None
        if next_index is not None:
            playlist_state["index"] = next_index
            next_track = tracks[next_index]
            DECKS[deck_id].update({"track": next_track, "is_playing": True, "playlist_index": next_index})
            try:
                async with httpx.AsyncClient(timeout=5) as c:
                    await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play",
                                 json={"filepath": str(Path("/library") / next_track), "loop": False})
            except Exception as e:
                print(f"[dead_air] recovery play failed: {e}")
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
            await manager.broadcast({
                "type": "NOTIFICATION",
                "message": f"✅ Deck {deck_id.upper()} recovered → {next_track}",
                "style": "success",
            })
            return {"status": "recovered", "action": "next_track", "track": next_track}
        else:
            # Playlist exhausted and no loop — stop cleanly
            DECK_PLAYLISTS[deck_id] = None
            DECKS[deck_id].update({"is_playing": False, "playlist_id": None, "playlist_index": None})
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
            return {"status": "stopped", "action": "playlist_done"}

    # Case 2: single-track loop → restart
    current_track = DECKS[deck_id].get("track")
    if current_track and DECKS[deck_id].get("is_loop"):
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play",
                             json={"filepath": str(Path("/library") / current_track), "loop": True})
        except Exception as e:
            print(f"[dead_air] loop restart failed: {e}")
        await manager.broadcast({
            "type": "NOTIFICATION",
            "message": f"✅ Deck {deck_id.upper()} loop restarted → {current_track}",
            "style": "success",
        })
        return {"status": "recovered", "action": "loop_restart", "track": current_track}

    # Case 3: nothing to recover — mark stopped, alert dashboard
    DECKS[deck_id].update({"is_playing": False, "is_paused": False})
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    await manager.broadcast({
        "type": "NOTIFICATION",
        "message": f"🔴 Dead air on Deck {deck_id.upper()} — no recovery source available",
        "style": "error",
    })
    return {"status": "stopped", "action": "no_source"}


@app.post("/api/decks/{deck_id}/track_ended")
async def track_ended(deck_id: str):
    if deck_id not in DECKS: return {"status": "ignored"}
    playlist_state = DECK_PLAYLISTS.get(deck_id)
    if not playlist_state:
        DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
        await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
        return {"status": "ok", "action": "stopped"}
    tracks = playlist_state["tracks"]; next_index = playlist_state["index"] + 1
    if next_index >= len(tracks):
        if playlist_state["loop"]: next_index = 0
        else:
            DECK_PLAYLISTS[deck_id] = None
            DECKS[deck_id].update({"is_playing": False, "is_paused": False, "playlist_id": None, "playlist_index": None})
            await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
            return {"status": "ok", "action": "playlist_done"}
    playlist_state["index"] = next_index; next_track = tracks[next_index]
    DECKS[deck_id].update({"track": next_track, "is_playing": True, "playlist_index": next_index, "is_crossfading": True})
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/crossfade", json={"filepath": str(Path("/library") / next_track), "loop": False})
    except Exception: pass
    async def _clr1(did=deck_id):
        await asyncio.sleep(3.5); DECKS[did]["is_crossfading"] = False
        await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    asyncio.create_task(_clr1())
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "action": "next_track", "track": next_track}

async def _play_playlist_index(deck_id: str, index: int):
    playlist_state = DECK_PLAYLISTS.get(deck_id)
    if not playlist_state: raise HTTPException(status_code=400, detail="No active playlist on this deck")
    tracks = playlist_state.get("tracks", [])
    if not tracks: raise HTTPException(status_code=400, detail="Playlist is empty")
    index = max(0, min(len(tracks) - 1, index))
    deck_is_playing = DECKS[deck_id].get("is_playing", False)  # capture BEFORE update
    playlist_state["index"] = index; track = tracks[index]
    DECKS[deck_id].update({"track": track, "is_playing": True, "is_paused": False, "playlist_index": index})
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            # Use crossfade if deck was playing before we updated state, plain play otherwise
            if deck_is_playing:
                DECKS[deck_id]["is_crossfading"] = True
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/crossfade", json={"filepath": str(Path("/library") / track), "loop": False})
                async def _clr2(did=deck_id):
                    await asyncio.sleep(3.5); DECKS[did]["is_crossfading"] = False
                    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
                asyncio.create_task(_clr2())
            else:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play", json={"filepath": str(Path("/library") / track), "loop": False})
    except Exception: pass
    await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    return {"status": "ok", "deck": deck_id, "track": track, "playlist_index": index}

@app.post("/api/decks/{deck_id}/next")
async def deck_next_track(deck_id: str, _user=Depends(require_permission("deck.next")), _access=Depends(require_deck_access("control"))):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    ps = DECK_PLAYLISTS.get(deck_id)
    if not ps: raise HTTPException(status_code=400, detail="Next is available only for playlists")
    tracks = ps.get("tracks", [])
    cur = int(ps.get("index", 0)); nxt = cur + 1
    if nxt >= len(tracks): nxt = 0 if ps.get("loop", False) else len(tracks) - 1
    return await _play_playlist_index(deck_id, nxt)

@app.post("/api/decks/{deck_id}/previous")
async def deck_previous_track(deck_id: str, _user=Depends(require_permission("deck.previous")), _access=Depends(require_deck_access("control"))):
    if deck_id not in DECKS: raise HTTPException(status_code=404, detail="Deck not found")
    ps = DECK_PLAYLISTS.get(deck_id)
    if not ps: raise HTTPException(status_code=400, detail="Previous is available only for playlists")
    tracks = ps.get("tracks", [])
    cur = int(ps.get("index", 0)); prev = cur - 1
    if prev < 0: prev = len(tracks) - 1 if ps.get("loop", False) else 0
    return await _play_playlist_index(deck_id, prev)

@app.get("/api/settings")
def get_settings(): return SETTINGS

@app.post("/api/settings")
async def update_settings(req: SettingUpdateRequest, _user=Depends(require_admin)):
    SETTINGS.update(req.value)
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_settings, req.value)
    except Exception as e:
        print(f"[DB] Failed to persist settings: {e}")
    await manager.broadcast({"type": "SETTINGS_UPDATED", "settings": _safe_settings(SETTINGS)})
    return {"status": "ok", "settings": _safe_settings(SETTINGS)}

# ── Scheduler ──────────────────────────────────────────────
@app.get("/api/scheduler/status")
def scheduler_status(): return get_scheduler_status()

@app.post("/api/recurring-mixer-schedules/{schedule_id}/reset")
async def reset_mixer_schedule(schedule_id: str, _user=Depends(require_permission("can_schedule"))):
    rs = next((x for x in RECURRING_MIXER_SCHEDULES if x["id"] == schedule_id), None)
    if not rs: raise HTTPException(status_code=404, detail="Schedule not found")
    rs["last_run_date"] = None
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.update_recurring_mixer_last_run, schedule_id, None)
    except Exception: pass
    return {"status": "ok"}

@app.post("/api/recurring-schedules/{schedule_id}/reset")
async def reset_recurring_schedule(schedule_id: str, _user=Depends(require_permission("can_schedule"))):
    rs = next((x for x in RECURRING_SCHEDULES if x["id"] == schedule_id), None)
    if not rs: raise HTTPException(status_code=404, detail="Schedule not found")
    rs["last_run_date"] = None
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.update_recurring_last_run, schedule_id, None)
    except Exception: pass
    return {"status": "ok"}

@app.post("/api/trigger/reset")
async def reset_trigger_lock(_user=Depends(verify_token)):
    if _TRIGGER_LOCK_REF[0].locked():
        try:
            _TRIGGER_LOCK_REF[0].release()
            return {"status": "ok", "message": "Trigger lock force released"}
        except RuntimeError:
            return {"status": "error", "message": "Lock not held"}
    return {"status": "ok", "message": "Lock was not held"}

@app.post("/api/settings/db-test")
async def test_db_connection(req: SettingUpdateRequest, _user=Depends(require_admin)):
    mode = req.value.get("db_mode", SETTINGS.get("db_mode", "local"))
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
            await asyncio.get_running_loop().run_in_executor(None, run_migrations_local, db_url)
            return {"status": "ok", "mode": "local", "migrations": "applied"}
        except Exception as e: raise HTTPException(status_code=503, detail=f"Local DB unreachable: {e}")
    else:
        supabase_url = req.value.get("supabase_url") or os.getenv("SUPABASE_URL", "")
        supabase_key = req.value.get("supabase_key") or os.getenv("SUPABASE_SERVICE_KEY", "")
        if not supabase_url or not supabase_key:
            raise HTTPException(status_code=400, detail="Supabase URL and Service Key required")
        try:
            async with httpx.AsyncClient(timeout=6) as c:
                r = await c.get(f"{supabase_url}/rest/v1/", headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"})
            if r.status_code >= 500: raise HTTPException(status_code=503, detail=f"Supabase returned {r.status_code}")
            from migrate import run_migrations_cloud
            ran = await asyncio.get_running_loop().run_in_executor(None, run_migrations_cloud, supabase_url, supabase_key)
            return {"status": "ok", "mode": "cloud", "migrations_applied": ran}
        except HTTPException: raise
        except Exception as e: raise HTTPException(status_code=503, detail=f"Supabase unreachable: {e}")

# ── Music Schedules ────────────────────────────────────────
@app.get("/api/music-schedules")
def list_music_schedules(): return MUSIC_SCHEDULES

@app.post("/api/music-schedules")
async def create_music_schedule(req: MusicScheduleCreateRequest, _user=Depends(require_permission("can_schedule"))):
    if req.deck_id not in DECKS: raise HTTPException(status_code=400, detail="Invalid deck_id")
    sid = str(uuid.uuid4())
    schedule = {"id": sid, "name": req.name, "deck_id": req.deck_id, "type": req.type,
                "target_id": req.target_id, "scheduled_at": req.scheduled_at,
                "loop": req.loop, "status": "Scheduled", "created_at": datetime.now().isoformat()}
    MUSIC_SCHEDULES.append(schedule); MUSIC_SCHEDULES.sort(key=lambda x: x["scheduled_at"])
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.create_music_schedule, schedule)
    except Exception: pass
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})
    return schedule

@app.delete("/api/music-schedules/{schedule_id}")
async def delete_music_schedule(schedule_id: str, _user=Depends(require_permission("can_schedule"))):
    global MUSIC_SCHEDULES
    MUSIC_SCHEDULES = [x for x in MUSIC_SCHEDULES if x["id"] != schedule_id]
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.delete_music_schedule, schedule_id)
    except Exception: pass
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})
    return {"status": "ok"}

@app.post("/api/music-schedules/{schedule_id}/trigger")
async def trigger_music_schedule_now(schedule_id: str, _user=Depends(require_permission("can_schedule"))):
    s = next((x for x in MUSIC_SCHEDULES if x["id"] == schedule_id), None)
    if not s: raise HTTPException(status_code=404, detail="Schedule not found")
    s["status"] = "Played"
    asyncio.create_task(_trigger_music_schedule(s))
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.update_music_schedule_status, schedule_id, "Played")
    except Exception: pass
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": MUSIC_SCHEDULES})
    return {"status": "ok"}

# ── Recurring Schedules ────────────────────────────────────
@app.get("/api/recurring-schedules")
def list_recurring_schedules(): return RECURRING_SCHEDULES

@app.post("/api/recurring-schedules")
async def create_recurring_schedule(req: RecurringScheduleCreateRequest, _user=Depends(verify_token)):
    sid = str(uuid.uuid4())
    schedule = {"id": sid, "name": req.name, "type": req.type, "announcement_id": req.announcement_id,
                "start_time": req.start_time, "active_days": req.active_days, "excluded_days": req.excluded_days,
                "fade_duration": req.fade_duration, "music_volume": req.music_volume, "target_decks": req.target_decks,
                "jingle_start": req.jingle_start, "jingle_end": req.jingle_end,
                "enabled": req.enabled, "last_run_date": None, "created_at": datetime.now().isoformat()}
    RECURRING_SCHEDULES.append(schedule)
    register_recurring_job(schedule)
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_recurring_schedule, schedule)
    except Exception: pass
    await manager.broadcast({"type": "RECURRING_SCHEDULES_UPDATED", "schedules": RECURRING_SCHEDULES})
    return schedule

@app.put("/api/recurring-schedules/{schedule_id}")
async def update_recurring_schedule(schedule_id: str, req: RecurringScheduleCreateRequest, _user=Depends(verify_token)):
    idx = next((i for i, x in enumerate(RECURRING_SCHEDULES) if x["id"] == schedule_id), None)
    if idx is None: raise HTTPException(status_code=404, detail="Schedule not found")
    updated = {**RECURRING_SCHEDULES[idx], "name": req.name, "type": req.type, "announcement_id": req.announcement_id,
               "start_time": req.start_time, "active_days": req.active_days, "excluded_days": req.excluded_days,
               "fade_duration": req.fade_duration, "music_volume": req.music_volume, "target_decks": req.target_decks,
               "jingle_start": req.jingle_start, "jingle_end": req.jingle_end,
               "enabled": req.enabled, "last_run_date": None}
    RECURRING_SCHEDULES[idx] = updated
    register_recurring_job(updated)
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_recurring_schedule, updated)
    except Exception: pass
    await manager.broadcast({"type": "RECURRING_SCHEDULES_UPDATED", "schedules": RECURRING_SCHEDULES})
    return updated

@app.delete("/api/recurring-schedules/{schedule_id}")
async def delete_recurring_schedule(schedule_id: str, _user=Depends(verify_token)):
    global RECURRING_SCHEDULES
    RECURRING_SCHEDULES = [x for x in RECURRING_SCHEDULES if x["id"] != schedule_id]
    unregister_job(f"recurring_{schedule_id}")
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.delete_recurring_schedule, schedule_id)
    except Exception: pass
    await manager.broadcast({"type": "RECURRING_SCHEDULES_UPDATED", "schedules": RECURRING_SCHEDULES})
    return {"status": "ok"}

@app.post("/api/recurring-schedules/{schedule_id}/trigger")
async def trigger_recurring_schedule(schedule_id: str, _user=Depends(verify_token)):
    await _ap_trigger_recurring(schedule_id)
    return {"status": "ok"}

# ── Recurring Mixer Schedules ──────────────────────────────
@app.get("/api/recurring-mixer-schedules")
def list_recurring_mixer_schedules(): return RECURRING_MIXER_SCHEDULES

@app.post("/api/recurring-mixer-schedules")
async def create_recurring_mixer_schedule(req: RecurringMixerScheduleCreateRequest, _user=Depends(verify_token)):
    invalid = [d for d in req.deck_ids if d not in DECKS]
    if invalid: raise HTTPException(status_code=400, detail=f"Invalid deck_ids: {invalid}")
    if not req.deck_ids: raise HTTPException(status_code=400, detail="At least one deck_id required")
    sid = str(uuid.uuid4())
    schedule = {"id": sid, "name": req.name, "type": req.type, "target_id": req.target_id,
                "deck_ids": req.deck_ids, "start_time": req.start_time,
                "active_days": req.active_days, "excluded_days": req.excluded_days,
                "fade_in": req.fade_in, "fade_out": req.fade_out, "volume": req.volume,
                "loop": req.loop, "jingle_start": req.jingle_start, "jingle_end": req.jingle_end,
                "multi_tracks": req.multi_tracks, "enabled": req.enabled, "last_run_date": None,
                "created_at": datetime.now().isoformat()}
    RECURRING_MIXER_SCHEDULES.append(schedule)
    register_mixer_job(schedule)
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_recurring_mixer_schedule, schedule)
    except Exception: pass
    await manager.broadcast({"type": "RECURRING_MIXER_SCHEDULES_UPDATED", "schedules": RECURRING_MIXER_SCHEDULES})
    return schedule

@app.put("/api/recurring-mixer-schedules/{schedule_id}")
async def update_recurring_mixer_schedule(schedule_id: str, req: RecurringMixerScheduleCreateRequest, _user=Depends(verify_token)):
    idx = next((i for i, x in enumerate(RECURRING_MIXER_SCHEDULES) if x["id"] == schedule_id), None)
    if idx is None: raise HTTPException(status_code=404, detail="Schedule not found")
    updated = {**RECURRING_MIXER_SCHEDULES[idx], "name": req.name, "type": req.type, "target_id": req.target_id,
               "deck_ids": req.deck_ids, "start_time": req.start_time,
               "active_days": req.active_days, "excluded_days": req.excluded_days,
               "fade_in": req.fade_in, "fade_out": req.fade_out, "volume": req.volume,
               "loop": req.loop, "jingle_start": req.jingle_start, "jingle_end": req.jingle_end,
               "multi_tracks": req.multi_tracks, "enabled": req.enabled, "last_run_date": None}
    RECURRING_MIXER_SCHEDULES[idx] = updated
    register_mixer_job(updated)
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.save_recurring_mixer_schedule, updated)
    except Exception: pass
    await manager.broadcast({"type": "RECURRING_MIXER_SCHEDULES_UPDATED", "schedules": RECURRING_MIXER_SCHEDULES})
    return updated

@app.delete("/api/recurring-mixer-schedules/{schedule_id}")
async def delete_recurring_mixer_schedule(schedule_id: str, _user=Depends(verify_token)):
    global RECURRING_MIXER_SCHEDULES
    RECURRING_MIXER_SCHEDULES = [x for x in RECURRING_MIXER_SCHEDULES if x["id"] != schedule_id]
    unregister_job(f"mixer_{schedule_id}")
    try:
        await asyncio.get_running_loop().run_in_executor(None, db.delete_recurring_mixer_schedule, schedule_id)
    except Exception: pass
    await manager.broadcast({"type": "RECURRING_MIXER_SCHEDULES_UPDATED", "schedules": RECURRING_MIXER_SCHEDULES})
    return {"status": "ok"}

@app.post("/api/recurring-mixer-schedules/{schedule_id}/trigger")
async def trigger_recurring_mixer_schedule(schedule_id: str, _user=Depends(verify_token)):
    await _ap_trigger_mixer(schedule_id)
    return {"status": "ok"}

# ── Stats ───────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    uptime = int(time.time() - START_TIME)
    h, rem = divmod(uptime, 3600); m, s = divmod(rem, 60)
    return {"uptime_seconds": uptime, "uptime_display": f"{h:02d}:{m:02d}:{s:02d}",
            "tracks_played": TRACKS_PLAYED, "playing_decks": sum(1 for d in DECKS.values() if d["is_playing"]),
            "library_count": len(list(MEDIA_DIR.glob("*.*"))), "announcements_count": len(ANNOUNCEMENTS),
            "peak_listeners": PEAK_LISTENERS, "current_listeners": CURRENT_LISTENERS}

# ── Music Requests (public submit) ──────────────────────────
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
    track_path = MEDIA_DIR / req.track
    if not track_path.exists(): raise HTTPException(status_code=404, detail="Track not found in library")
    if req.requester_email:
        existing = [r for r in MUSIC_REQUESTS if r.get("requester_email") == req.requester_email and r["status"] == "pending"]
        if len(existing) >= 3: raise HTTPException(status_code=429, detail="Maximum 3 pending requests per user")
    music_req = {"id": str(uuid.uuid4()), "requester_name": req.requester_name,
                 "requester_email": req.requester_email, "requester_phone": req.requester_phone,
                 "requester_photo": req.requester_photo, "track": req.track, "message": req.message,
                 "target_deck": req.target_deck, "status": "pending", "created_at": datetime.now().isoformat()}
    MUSIC_REQUESTS.insert(0, music_req)
    # FIX (Bug 9): persist new request to DB
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, db.save_music_request, music_req)
    except Exception as e:
        print(f"[requests] Failed to persist music request: {e}")
    await manager.broadcast({"type": "REQUESTS_UPDATED", "requests": MUSIC_REQUESTS})
    return {"status": "ok", "request": music_req}

@app.get("/api/requests")
async def list_music_requests(_user=Depends(verify_token)): return MUSIC_REQUESTS

@app.post("/api/requests/{request_id}/accept")
async def accept_music_request(request_id: str, _user=Depends(require_permission("can_requests"))):
    req = next((r for r in MUSIC_REQUESTS if r["id"] == request_id), None)
    if not req: raise HTTPException(status_code=404, detail="Request not found")
    req["status"] = "accepted"
    deck_id = (req.get("target_deck") or "a").lower()
    if deck_id not in DECKS: deck_id = "a"
    filename = req["track"]
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/decks/{deck_id}/load", json={"filepath": str(Path("/library") / filename)})
        DECKS[deck_id]["track"] = filename; DECKS[deck_id]["is_playing"] = False; DECKS[deck_id]["is_paused"] = False
        await manager.broadcast({"type": "DECK_STATE", "decks": list(DECKS.values())})
    except Exception as e:
        print(f"[request] Failed to load track to deck: {e}")
    await manager.broadcast({"type": "REQUESTS_UPDATED", "requests": MUSIC_REQUESTS})
    return {"status": "ok", "loaded_to": deck_id}

@app.delete("/api/requests/{request_id}")
async def dismiss_music_request(request_id: str, _user=Depends(require_permission("can_requests"))):
    global MUSIC_REQUESTS
    req = next((r for r in MUSIC_REQUESTS if r["id"] == request_id), None)
    if req: req["status"] = "dismissed"
    MUSIC_REQUESTS = [r for r in MUSIC_REQUESTS if r["status"] in ("pending", "accepted")]
    # FIX (Bug 9): remove dismissed request from DB
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, db.delete_music_request, request_id)
    except Exception as e:
        print(f"[requests] Failed to delete music request: {e}")
    await manager.broadcast({"type": "REQUESTS_UPDATED", "requests": MUSIC_REQUESTS})
    return {"status": "ok"}

@app.delete("/api/requests")
async def clear_all_requests(_user=Depends(require_permission("can_requests"))):
    global MUSIC_REQUESTS
    MUSIC_REQUESTS = []
    # FIX (Bug 9): clear all requests from DB
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, db.clear_music_requests)
    except Exception as e:
        print(f"[requests] Failed to clear music requests: {e}")
    await manager.broadcast({"type": "REQUESTS_UPDATED", "requests": MUSIC_REQUESTS})
    return {"status": "ok"}

# ═══════════════════════════════════════════════════════════
#  USER MANAGEMENT ENDPOINTS (admin only)
# ═══════════════════════════════════════════════════════════

class UserCreateRequest(_PydanticBase):
    username: str
    display_name: Optional[str] = None
    password: str
    role: str = "operator"

class UserUpdateRequest(_PydanticBase):
    display_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    enabled: Optional[bool] = None

@app.get("/api/users")
async def list_users(_user: dict = Depends(verify_token)):
    loop = asyncio.get_running_loop()
    users = await loop.run_in_executor(None, db.list_users)
    return [{k: v for k, v in u.items() if k != "password_hash"} for u in users]

@app.post("/api/users", status_code=201)
async def create_user(req: UserCreateRequest, request: Request, _user: dict = Depends(verify_token)):
    if not (_user.get("role") == "admin" or _user.get("is_super_admin")):
        raise HTTPException(status_code=403, detail="Admin access required")

    loop = asyncio.get_running_loop()
    all_roles = await loop.run_in_executor(None, db.list_roles)
    valid_names = {r["name"] for r in all_roles}
    role = req.role.strip().lower()
    if role not in valid_names:
        raise HTTPException(status_code=400, detail=f"Unknown role '{role}'. Valid: {sorted(valid_names)}")

    if role in ("admin", "super_admin") and not _user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only super-admin can create admin accounts")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    pw_hash = hash_password(req.password)
    user_id = str(uuid.uuid4())
    try:
        user = await loop.run_in_executor(None, db.create_user, user_id,
                                           req.username.strip(),
                                           req.display_name or req.username.strip(),
                                           pw_hash, role,
                                           role == "super_admin")
    except Exception as e:
        msg = str(e)
        if "unique" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail="Username already exists")
        raise HTTPException(status_code=500, detail=f"DB error: {msg}")

    try:
        role_obj = next((r for r in all_roles if r["name"] == role), None)
        if role_obj:
            from rbac import _role_to_perms
            perms = _role_to_perms(role_obj)
            await loop.run_in_executor(None, db.save_permissions, user_id, perms)
    except Exception as e:
        print(f"[create_user] Failed to auto-apply role permissions: {e}")

    _audit(request, _user, "user.create", {"target": req.username, "role": role})
    return {k: v for k, v in user.items() if k != "password_hash"}

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, req: UserUpdateRequest, request: Request, _user: dict = Depends(verify_token)):
    is_super = _user.get("is_super_admin", False)
    is_admin = _user.get("role") == "admin"
    is_self  = _user.get("sub") == user_id
    if not is_super and not is_admin and not is_self:
        raise HTTPException(status_code=403, detail="Admin access required")
    if not is_super and not is_admin and (req.role is not None or req.enabled is not None):
        raise HTTPException(status_code=403, detail="Only admins can change role or enabled status")

    loop = asyncio.get_running_loop()
    if req.role is not None:
        all_roles = await loop.run_in_executor(None, db.list_roles)
        valid_names = {r["name"] for r in all_roles}
        if req.role not in valid_names:
            raise HTTPException(status_code=400, detail=f"Unknown role '{req.role}'. Valid: {sorted(valid_names)}")
        if req.role in ("admin", "super_admin") and not is_super:
            raise HTTPException(status_code=403, detail="Only super-admin can assign admin/super_admin role")

    fields = {}
    if req.display_name is not None: fields["display_name"] = req.display_name
    if req.role        is not None:  fields["role"]         = req.role
    if req.enabled     is not None:  fields["enabled"]      = req.enabled
    if req.password    is not None:
        if len(req.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        fields["password_hash"] = hash_password(req.password)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        await loop.run_in_executor(None, db.update_user, user_id, fields)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    safe = {k: v for k, v in fields.items() if k != "password_hash"}
    _audit(request, _user, "user.update", {"target_id": user_id, "fields": list(safe.keys())})
    return {"status": "ok"}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, request: Request, _user: dict = Depends(verify_token)):
    is_super = _user.get("is_super_admin", False)
    if not is_super and _user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if _user.get("sub") == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, db.delete_user, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    _audit(request, _user, "user.delete", {"target_id": user_id})
    return {"status": "ok"}

# ── Permissions ─────────────────────────────────────────────

class PermissionsRequest(_PydanticBase):
    allowed_decks:  List[str]            = ["a","b","c","d","e","f"]
    deck_control:   Optional[dict]       = None
    deck_actions:   Optional[List[str]]  = None
    playlist_perms: Optional[List[str]]  = None
    can_announce:  bool = True
    can_schedule:  bool = True
    can_library:   bool = True
    can_requests:  bool = True
    can_settings:  bool = False

@app.get("/api/users/{user_id}/permissions")
async def get_user_permissions(user_id: str, _user: dict = Depends(verify_token)):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, db.get_permissions, user_id)

@app.put("/api/users/{user_id}/permissions")
async def save_user_permissions(user_id: str, req: PermissionsRequest, request: Request, _user: dict = Depends(verify_token)):
    if not (_user.get("is_super_admin") or _user.get("role") == "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    from db_client import DEFAULT_DECK_CONTROL, DEFAULT_DECK_ACTIONS, DEFAULT_PLAYLIST_PERMS
    perms = req.dict()
    if perms["deck_control"]   is None: perms["deck_control"]   = DEFAULT_DECK_CONTROL
    if perms["deck_actions"]   is None: perms["deck_actions"]   = DEFAULT_DECK_ACTIONS
    if perms["playlist_perms"] is None: perms["playlist_perms"] = DEFAULT_PLAYLIST_PERMS
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, db.save_permissions, user_id, perms)
    _audit(request, _user, "user.permissions", {"target_id": user_id, "decks": req.allowed_decks})
    return {"status": "ok"}

# ── Audit Logs ───────────────────────────────────────────────

@app.get("/api/logs")
async def get_audit_logs(
    limit: int = 200,
    user_id: Optional[str] = None,
    offset: int = 0,
    _user: dict = Depends(verify_token),
):
    """Admins see all logs; operators only see their own."""
    if _user.get("role") != "admin" and not _user.get("is_super_admin"):
        user_id = _user.get("sub")
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, db.get_logs, limit, user_id, offset)
