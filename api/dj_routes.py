"""
dj_routes.py — CocoStation DJ Booth API Router
================================================
All /api/dj/* endpoints.  Imported and mounted in main.py via:
    app.include_router(dj_router)

Endpoints:
    POST /api/dj/session/start
    POST /api/dj/session/end
    GET  /api/dj/decks/status
    POST /api/dj/deck/reserve
    POST /api/dj/deck/release
    POST /api/dj/deck/heartbeat
    POST /api/dj/stream/detected   ← MediaMTX runOnPublish hook (no auth)
    POST /api/dj/stream/ended      ← MediaMTX runOnUnpublish hook (no auth)
    POST /api/dj/announce
    POST /api/dj/effect
    POST /api/dj/record/start
    POST /api/dj/record/stop
"""

import os
import asyncio
import time
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import verify_token
from dj_redis import (
    create_session      as dj_create_session,
    get_session         as dj_get_session,
    delete_session      as dj_delete_session,
    get_deck_state      as dj_get_deck_state,
    get_all_deck_states as dj_get_all_deck_states,
    reserve_deck        as dj_reserve_deck,
    release_deck        as dj_release_deck,
    renew_lock          as dj_renew_lock,
    set_stream_detected as dj_set_stream_detected,
    set_deck_live       as dj_set_deck_live,
    set_deck_stopping   as dj_set_deck_stopping,
    set_deck_recovery   as dj_set_deck_recovery,
    clear_deck_state    as dj_clear_deck_state,
    get_stream_info     as dj_get_stream_info,
    save_zone_state     as dj_save_zone_state,
    get_zone_state      as dj_get_zone_state,
    clear_zone_state    as dj_clear_zone_state,
    set_recording       as dj_set_recording,
    get_recording       as dj_get_recording,
    clear_recording     as dj_clear_recording,
    set_effect          as dj_set_effect,
    clear_effect        as dj_clear_effect,
    ping_redis,
    DECK_IDS as DJ_DECK_IDS,
)

dj_router = APIRouter(prefix="/api/dj", tags=["DJ Booth"])

FFMPEG_URL  = f"http://{os.getenv('FFMPEG_HOST', 'ffmpeg-mixer')}:8001"

# These are injected from main.py at startup via init_dj_router()
_manager_ref   = None   # ConnectionManager instance
_decks_ref     = None   # DECKS dict
_db_ref        = None   # db client
_audit_fn      = None   # _audit helper
_tts_fn        = None   # generate_tts
_audio_dur_fn  = None   # get_audio_duration


def init_dj_router(manager, decks, db, audit_fn, tts_fn, audio_dur_fn):
    """Called once from main.py lifespan to inject shared state."""
    global _manager_ref, _decks_ref, _db_ref, _audit_fn, _tts_fn, _audio_dur_fn
    _manager_ref  = manager
    _decks_ref    = decks
    _db_ref       = db
    _audit_fn     = audit_fn
    _tts_fn       = tts_fn
    _audio_dur_fn = audio_dur_fn


# ── Pydantic request models ──────────────────────────────────────────────────

class DJSessionStartRequest(BaseModel):
    audio_src:   str
    audio_label: str = ""

class DJDeckReserveRequest(BaseModel):
    deck_id: str
    zone:    str = ""

class DJDeckReleaseRequest(BaseModel):
    deck_id: str

class DJHeartbeatRequest(BaseModel):
    deck_id: str

class DJStreamDetectedRequest(BaseModel):
    deck:          str
    mediamtx_path: str = ""
    stream_url:    str = ""

class DJStreamEndedRequest(BaseModel):
    deck: str

class DJAnnounceRequest(BaseModel):
    deck_id: str
    text:    str = ""
    file:    str = ""

class DJEffectRequest(BaseModel):
    deck_id: str
    effect:  str  # "reverb" | "echo" | "eq" | "none"

class DJRecordRequest(BaseModel):
    deck_id: str


# ── Internal helpers ─────────────────────────────────────────────────────────

async def _dj_broadcast(event: str, **kwargs):
    if _manager_ref:
        await _manager_ref.broadcast({"type": "DJ_EVENT", "event": event, **kwargs})


async def _get_allowed_decks(user_id: str) -> list:
    """Return deck IDs where the user has control access."""
    try:
        loop = asyncio.get_running_loop()
        perms = await loop.run_in_executor(None, _db_ref.get_permissions, user_id)
        deck_control = perms.get("deck_control") or {}
        return [d for d in DJ_DECK_IDS if deck_control.get(d, {}).get("control", False)]
    except Exception as e:
        print(f"[dj] _get_allowed_decks failed for {user_id}: {e}")
        return list(DJ_DECK_IDS)


async def _dj_fade(deck_id: str, direction: str, seconds: float = 3.0):
    """Smoothly fade a deck's volume. direction: 'out' (100→0) or 'in' (0→100)."""
    steps = 20
    delay = seconds / steps
    start = 100 if direction == "out" else 0
    end   = 0   if direction == "out" else 100
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            for i in range(steps + 1):
                vol = round(start + (end - start) * i / steps)
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/{vol}")
                if i < steps:
                    await asyncio.sleep(delay)
    except Exception as e:
        print(f"[dj] _dj_fade {direction} deck={deck_id}: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
#  1.  POST /api/dj/session/start
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/session/start")
async def dj_session_start(
    req:     DJSessionStartRequest,
    request: Request,
    user:    dict = Depends(verify_token),
):
    user_id  = user["sub"]
    raw_name = user.get("display_name") or user.get("username", "DJ")
    dj_name  = raw_name if raw_name.lower().startswith("dj") else f"DJ {raw_name}"

    if not await ping_redis():
        raise HTTPException(status_code=503, detail="Redis unavailable — DJ booth cannot start")

    session       = await dj_create_session(user_id, dj_name, req.audio_src, req.audio_label)
    allowed_decks = await _get_allowed_decks(user_id)
    deck_states   = await dj_get_all_deck_states()

    if _audit_fn:
        _audit_fn(request, user, "dj.session_start", {"audio_src": req.audio_src, "allowed": allowed_decks})

    return {
        "status":        "ok",
        "dj_name":       dj_name,
        "session":       session,
        "allowed_decks": allowed_decks,
        "deck_states":   deck_states,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  2.  POST /api/dj/session/end
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/session/end")
async def dj_session_end(request: Request, user: dict = Depends(verify_token)):
    user_id = user["sub"]
    session = await dj_get_session(user_id)
    if session and session.get("deck_id"):
        deck_id = session["deck_id"]
        await dj_clear_deck_state(deck_id)
        await _dj_broadcast("deck_released", deck=deck_id, dj=user_id)

    await dj_delete_session(user_id)
    if _audit_fn:
        _audit_fn(request, user, "dj.session_end", {})
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
#  3.  GET /api/dj/decks/status
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.get("/decks/status")
async def dj_decks_status(_user: dict = Depends(verify_token)):
    states = await dj_get_all_deck_states()
    return {"status": "ok", "decks": states}


# ═══════════════════════════════════════════════════════════════════════════════
#  4.  POST /api/dj/deck/reserve
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/deck/reserve")
async def dj_deck_reserve(
    req:     DJDeckReserveRequest,
    request: Request,
    user:    dict = Depends(verify_token),
):
    user_id = user["sub"]
    deck_id = req.deck_id.lower()
    dj_name = user.get("display_name") or user.get("username", "DJ")

    allowed = await _get_allowed_decks(user_id)
    if deck_id not in allowed:
        raise HTTPException(status_code=403, detail=f"No control permission for Deck {deck_id.upper()}")

    decks = _decks_ref or {}
    zone  = req.zone or decks.get(deck_id, {}).get("name", deck_id.upper())

    result = await dj_reserve_deck(deck_id, user_id, dj_name, zone)
    if not result["ok"]:
        raise HTTPException(status_code=409, detail=result["reason"])

    await _dj_broadcast("deck_reserved", deck=deck_id, dj=dj_name, zone=zone)
    if _audit_fn:
        _audit_fn(request, user, "dj.deck_reserve", {"deck": deck_id, "zone": zone})
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  5.  POST /api/dj/deck/release
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/deck/release")
async def dj_deck_release(
    req:     DJDeckReleaseRequest,
    request: Request,
    user:    dict = Depends(verify_token),
):
    user_id = user["sub"]
    deck_id = req.deck_id.lower()

    result = await dj_release_deck(deck_id, user_id)
    if not result["ok"]:
        raise HTTPException(status_code=403, detail=result["reason"])

    await _dj_broadcast("deck_released", deck=deck_id, dj=user_id)
    if _audit_fn:
        _audit_fn(request, user, "dj.deck_release", {"deck": deck_id})
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  6.  POST /api/dj/deck/heartbeat  — renew Redis lock TTL every 20 s
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/deck/heartbeat")
async def dj_deck_heartbeat(req: DJHeartbeatRequest, user: dict = Depends(verify_token)):
    renewed = await dj_renew_lock(req.deck_id.lower(), user["sub"])
    return {"status": "ok", "renewed": renewed}


# ═══════════════════════════════════════════════════════════════════════════════
#  7.  POST /api/dj/stream/detected  ← MediaMTX runOnPublish
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/stream/detected")
async def dj_stream_detected(req: DJStreamDetectedRequest):
    """Internal hook — no JWT needed. MediaMTX calls this when OBS starts streaming."""
    deck_id = req.deck.lower().removeprefix("dj-")
    state   = await dj_get_deck_state(deck_id)
    dj_name = state.get("owner_name", "DJ")
    zone    = state.get("zone", deck_id.upper())

    print(f"[dj] stream/detected → deck={deck_id} path={req.mediamtx_path}")
    await dj_set_stream_detected(deck_id, req.mediamtx_path, req.stream_url)
    await _dj_broadcast("deck_going_live", deck=deck_id, dj=dj_name, zone=zone)

    # Snapshot current playlist state for later restore
    decks    = _decks_ref or {}
    dk_info  = decks.get(deck_id, {})
    await dj_save_zone_state(
        deck_id,
        source        = "PLAYLIST",
        prev_track    = dk_info.get("track"),
        prev_playlist = str(dk_info.get("playlist_id") or ""),
    )

    async def _go_live():
        try:
            await _dj_fade(deck_id, "out", seconds=3.0)
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/dj/{deck_id}/switch_to_dj")
            await dj_set_deck_live(deck_id)
            await _dj_broadcast("deck_live", deck=deck_id, dj=dj_name, zone=zone)
            await _dj_fade(deck_id, "in", seconds=3.0)
            print(f"[dj] deck {deck_id} → LIVE ✓")
        except Exception as e:
            print(f"[dj] go_live error: {e}")

    asyncio.create_task(_go_live())
    return {"status": "ok", "deck": deck_id}


# ═══════════════════════════════════════════════════════════════════════════════
#  8.  POST /api/dj/stream/ended  ← MediaMTX runOnUnpublish
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/stream/ended")
async def dj_stream_ended(req: DJStreamEndedRequest):
    """Internal hook — no JWT needed. MediaMTX calls this when stream disconnects."""
    deck_id = req.deck.lower().removeprefix("dj-")
    state   = await dj_get_deck_state(deck_id)

    if state.get("status") not in ("LIVE", "GOING_LIVE", "STOPPING", "RESERVED"):
        # Unexpected drop → RECOVERY grace window (30 s auto-release)
        await dj_set_deck_recovery(deck_id)
        await _dj_broadcast("deck_recovery", deck=deck_id)
        print(f"[dj] deck {deck_id} → RECOVERY (unexpected drop)")
        return {"status": "ok", "mode": "recovery"}

    print(f"[dj] stream/ended → deck={deck_id} STOPPING")
    await dj_set_deck_stopping(deck_id)
    await _dj_broadcast("deck_stopping", deck=deck_id)

    async def _restore():
        try:
            await _dj_fade(deck_id, "out", seconds=1.0)
            zone_st    = await dj_get_zone_state(deck_id)
            prev_track = zone_st.get("prev_track")
            if prev_track:
                try:
                    async with httpx.AsyncClient(timeout=5) as c:
                        await c.post(f"{FFMPEG_URL}/dj/{deck_id}/switch_to_playlist",
                                     json={"filepath": prev_track, "loop": False})
                except Exception as e:
                    print(f"[dj] resume track error: {e}")
            await _dj_fade(deck_id, "in", seconds=3.0)
            await dj_clear_deck_state(deck_id)
            await dj_clear_zone_state(deck_id)
            await _dj_broadcast("playlist_resumed", deck=deck_id, zone=state.get("zone", ""))
            print(f"[dj] deck {deck_id} → AVAILABLE ✓")
        except Exception as e:
            print(f"[dj] _restore error: {e}")

    asyncio.create_task(_restore())
    return {"status": "ok", "deck": deck_id}


# ═══════════════════════════════════════════════════════════════════════════════
#  9.  POST /api/dj/announce  — duck + play TTS/file + restore
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/announce")
async def dj_announce(
    req:     DJAnnounceRequest,
    request: Request,
    user:    dict = Depends(verify_token),
):
    deck_id = req.deck_id.lower()
    state   = await dj_get_deck_state(deck_id)
    if state.get("status") != "LIVE":
        raise HTTPException(status_code=400, detail="Deck is not LIVE — cannot announce")

    await _dj_broadcast("announcement", deck=deck_id, status="playing")

    async def _announce():
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/20")

            if req.file:
                async with httpx.AsyncClient(timeout=5) as c:
                    await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play_announcement",
                                 json={"filepath": f"/announcements/{req.file}", "notify": True})
                await asyncio.sleep(6)

            elif req.text and _tts_fn:
                tts_path = await _tts_fn(req.text)
                if tts_path and _audio_dur_fn:
                    duration = await _audio_dur_fn(Path(tts_path))
                    async with httpx.AsyncClient(timeout=5) as c:
                        await c.post(f"{FFMPEG_URL}/decks/{deck_id}/play_announcement",
                                     json={"filepath": tts_path, "notify": True})
                    await asyncio.sleep(duration + 0.5)

            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{FFMPEG_URL}/decks/{deck_id}/volume/100")
            await _dj_broadcast("announcement", deck=deck_id, status="done")
        except Exception as e:
            print(f"[dj] announce error: {e}")
            await _dj_broadcast("announcement", deck=deck_id, status="error")

    asyncio.create_task(_announce())
    if _audit_fn:
        _audit_fn(request, user, "dj.announce", {"deck": deck_id})
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
# 10.  POST /api/dj/effect
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/effect")
async def dj_effect(
    req:     DJEffectRequest,
    request: Request,
    user:    dict = Depends(verify_token),
):
    deck_id = req.deck_id.lower()
    if req.effect == "none":
        await dj_clear_effect(deck_id)
    else:
        await dj_set_effect(deck_id, req.effect)

    # Call ffmpeg-mixer to apply the audio effect
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/dj/{deck_id}/effect", json={"effect": req.effect})
    except Exception as e:
        print(f"[dj] failed to apply ffmpeg effect: {e}")

    await _dj_broadcast("effect_applied", deck=deck_id, effect=req.effect)
    if _audit_fn:
        _audit_fn(request, user, "dj.effect", {"deck": deck_id, "effect": req.effect})
    return {"status": "ok", "deck": deck_id, "effect": req.effect}


# ═══════════════════════════════════════════════════════════════════════════════
# 11.  POST /api/dj/record/start  +  POST /api/dj/record/stop
# ═══════════════════════════════════════════════════════════════════════════════

@dj_router.post("/record/start")
async def dj_record_start(
    req:     DJRecordRequest,
    request: Request,
    user:    dict = Depends(verify_token),
):
    deck_id    = req.deck_id.lower()
    session    = await dj_get_session(user["sub"])
    ts         = int(time.time())
    filename   = f"session_{deck_id}_{ts}.mp3"
    session_id = session.get("started_at", str(ts)) if session else str(ts)

    await dj_set_recording(deck_id, filename, session_id)
    
    # Call ffmpeg-mixer to start recording
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/dj/{deck_id}/record_start", json={"filename": filename})
    except Exception as e:
        print(f"[dj] failed to start ffmpeg recording: {e}")

    await _dj_broadcast("recording_start", deck=deck_id, file=filename)
    if _audit_fn:
        _audit_fn(request, user, "dj.record_start", {"deck": deck_id, "file": filename})
    return {"status": "ok", "deck": deck_id, "file": filename}


@dj_router.post("/record/stop")
async def dj_record_stop(
    req:     DJRecordRequest,
    request: Request,
    user:    dict = Depends(verify_token),
):
    deck_id  = req.deck_id.lower()
    rec      = await dj_get_recording(deck_id)
    filename = rec.get("filename", "") if rec else ""
    await dj_clear_recording(deck_id)
    
    # Call ffmpeg-mixer to stop recording
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(f"{FFMPEG_URL}/dj/{deck_id}/record_stop")
    except Exception as e:
        print(f"[dj] failed to stop ffmpeg recording: {e}")

    await _dj_broadcast("recording_stop", deck=deck_id, file=filename)
    if _audit_fn:
        _audit_fn(request, user, "dj.record_stop", {"deck": deck_id})
    return {"status": "ok", "deck": deck_id}
