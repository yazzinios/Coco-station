"""
dj_redis.py — CocoStation DJ Redis Layer
=========================================
All Redis keys, state machines, and atomic operations for the DJ engine.

Key schema:
  dj:session:{user_id}     → hash  { status, deck_id, dj_name, audio_src, started_at, token }
  dj:deck:{deck_id}        → hash  { status, owner_id, owner_name, zone, started_at, stream_key }
  dj:lock:{deck_id}        → string (TTL=30s heartbeat lock, prevents ghost reservations)
  dj:stream:{deck_id}      → hash  { stream_url, detected_at, mediamtx_path }
  dj:zone:{deck_id}        → hash  { source: PLAYLIST|DJ|ANNOUNCEMENT, prev_track, prev_playlist }
  dj:recording:{deck_id}   → hash  { filename, started_at, session_id }
  dj:effect:{deck_id}      → string (active effect name or empty)

Deck status values:
  AVAILABLE   → no one owns it
  RESERVED    → user selected it, not yet streaming
  GOING_LIVE  → fade-out in progress
  LIVE        → DJ stream active
  STOPPING    → fade-out DJ, fade-in playlist in progress
  RECOVERY    → stream dropped unexpectedly (30s grace window)
"""

import os
import json
import time
import asyncio
from typing import Optional, Dict, Any

import redis.asyncio as aioredis

# ── Connection ──────────────────────────────────────────────────────────────

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis


async def ping_redis() -> bool:
    try:
        r = await get_redis()
        return await r.ping()
    except Exception as e:
        print(f"[redis] ping failed: {e}")
        return False


# ── Key builders ─────────────────────────────────────────────────────────────

def _k_session(user_id: str) -> str:  return f"dj:session:{user_id}"
def _k_deck(deck_id: str) -> str:     return f"dj:deck:{deck_id.lower()}"
def _k_lock(deck_id: str) -> str:     return f"dj:lock:{deck_id.lower()}"
def _k_stream(deck_id: str) -> str:   return f"dj:stream:{deck_id.lower()}"
def _k_zone(deck_id: str) -> str:     return f"dj:zone:{deck_id.lower()}"
def _k_record(deck_id: str) -> str:   return f"dj:recording:{deck_id.lower()}"
def _k_effect(deck_id: str) -> str:   return f"dj:effect:{deck_id.lower()}"

DECK_IDS = ["a", "b", "c", "d", "e", "f"]
LOCK_TTL = 30        # seconds — heartbeat must renew before expiry
RESERVE_TTL = 120    # seconds — auto-release if no stream arrives after reservation
RECOVERY_TTL = 30    # seconds — grace window after unexpected stream drop


# ── Deck state helpers ────────────────────────────────────────────────────────

async def get_deck_state(deck_id: str) -> Dict[str, Any]:
    r = await get_redis()
    data = await r.hgetall(_k_deck(deck_id))
    if not data:
        return {"deck_id": deck_id, "status": "AVAILABLE", "owner_id": None,
                "owner_name": None, "zone": None, "started_at": None, "stream_key": None}
    return {
        "deck_id":    deck_id,
        "status":     data.get("status", "AVAILABLE"),
        "owner_id":   data.get("owner_id"),
        "owner_name": data.get("owner_name"),
        "zone":       data.get("zone"),
        "started_at": data.get("started_at"),
        "stream_key": data.get("stream_key"),
    }


async def get_all_deck_states() -> Dict[str, Dict]:
    states = {}
    for d in DECK_IDS:
        states[d] = await get_deck_state(d)
    return states


async def set_deck_state(deck_id: str, **fields) -> None:
    r = await get_redis()
    key = _k_deck(deck_id)
    # Filter out None values — we never want to store "None" strings
    cleaned = {k: v for k, v in fields.items() if v is not None}
    if cleaned:
        await r.hset(key, mapping=cleaned)


async def clear_deck_state(deck_id: str) -> None:
    """Reset deck fully to AVAILABLE."""
    r = await get_redis()
    await r.delete(_k_deck(deck_id))
    await r.delete(_k_lock(deck_id))
    await r.delete(_k_stream(deck_id))
    await r.delete(_k_effect(deck_id))


# ── Session helpers ───────────────────────────────────────────────────────────

async def get_session(user_id: str) -> Optional[Dict]:
    r = await get_redis()
    data = await r.hgetall(_k_session(user_id))
    return data if data else None


async def create_session(user_id: str, dj_name: str, audio_src: str, audio_label: str) -> Dict:
    r = await get_redis()
    session = {
        "user_id":     user_id,
        "dj_name":     dj_name,
        "audio_src":   audio_src,
        "audio_label": audio_label,
        "status":      "AUTHENTICATED",
        "deck_id":     "",
        "started_at":  str(time.time()),
    }
    expiry = int(os.getenv("DJ_SESSION_TTL", 28800))  # 8 hours default
    await r.hset(_k_session(user_id), mapping=session)
    await r.expire(_k_session(user_id), expiry)
    return session


async def update_session(user_id: str, **fields) -> None:
    r = await get_redis()
    cleaned = {k: v for k, v in fields.items() if v is not None}
    if cleaned:
        await r.hset(_k_session(user_id), mapping=cleaned)


async def delete_session(user_id: str) -> None:
    r = await get_redis()
    await r.delete(_k_session(user_id))


# ── Deck reservation (atomic with lock) ──────────────────────────────────────

async def reserve_deck(deck_id: str, user_id: str, owner_name: str, zone: str) -> Dict:
    """
    Atomically reserve a deck for a user.
    Returns {"ok": True} or {"ok": False, "reason": str}
    """
    r = await get_redis()
    deck_id = deck_id.lower()
    lock_key = _k_lock(deck_id)

    # Try to SET NX (only if not exists) — atomic lock acquisition
    acquired = await r.set(lock_key, user_id, nx=True, ex=LOCK_TTL)
    if not acquired:
        # Check if the lock owner is the same user (re-entrant)
        lock_owner = await r.get(lock_key)
        if lock_owner != user_id:
            return {"ok": False, "reason": f"Deck {deck_id.upper()} is locked by another session"}

    # Check current deck status
    current = await get_deck_state(deck_id)
    if current["status"] not in ("AVAILABLE",) and current.get("owner_id") != user_id:
        await r.delete(lock_key)
        return {"ok": False, "reason": f"Deck {deck_id.upper()} is {current['status']} by another DJ"}

    # Reserve it
    now = str(time.time())
    await r.hset(_k_deck(deck_id), mapping={
        "status":     "RESERVED",
        "owner_id":   user_id,
        "owner_name": owner_name,
        "zone":       zone,
        "started_at": now,
        "stream_key": "",
    })
    # Auto-expire reservation if no stream arrives within RESERVE_TTL
    await r.expire(_k_deck(deck_id), RESERVE_TTL)
    await r.expire(lock_key, LOCK_TTL)

    await update_session(user_id, deck_id=deck_id, status="DECK_SELECTED")
    return {"ok": True, "deck_id": deck_id, "status": "RESERVED", "zone": zone}


async def release_deck(deck_id: str, user_id: str) -> Dict:
    """Release a deck back to AVAILABLE. Only the owner (or admin) can release."""
    r = await get_redis()
    deck_id = deck_id.lower()
    current = await get_deck_state(deck_id)

    if current.get("owner_id") and current["owner_id"] != user_id:
        return {"ok": False, "reason": "You don't own this deck"}

    await clear_deck_state(deck_id)
    await update_session(user_id, deck_id="", status="AUTHENTICATED")
    return {"ok": True, "deck_id": deck_id, "status": "AVAILABLE"}


async def renew_lock(deck_id: str, user_id: str) -> bool:
    """Renew the TTL on the deck lock (heartbeat). Returns True if lock still owned."""
    r = await get_redis()
    lock_key = _k_lock(deck_id)
    owner = await r.get(lock_key)
    if owner == user_id:
        await r.expire(lock_key, LOCK_TTL)
        await r.expire(_k_session(user_id), int(os.getenv("DJ_SESSION_TTL", 28800)))
        return True
    return False


# ── Stream state ──────────────────────────────────────────────────────────────

async def set_stream_detected(deck_id: str, mediamtx_path: str, stream_url: str) -> None:
    r = await get_redis()
    deck_id = deck_id.lower()
    await r.hset(_k_stream(deck_id), mapping={
        "mediamtx_path": mediamtx_path,
        "stream_url":    stream_url,
        "detected_at":   str(time.time()),
    })
    await r.persist(_k_deck(deck_id))  # Remove auto-expire once stream is live
    await set_deck_state(deck_id, status="GOING_LIVE")


async def set_deck_live(deck_id: str) -> None:
    await set_deck_state(deck_id.lower(), status="LIVE", started_at=str(time.time()))


async def set_deck_stopping(deck_id: str) -> None:
    await set_deck_state(deck_id.lower(), status="STOPPING")


async def set_deck_recovery(deck_id: str) -> None:
    """Mark deck as RECOVERY — auto-clears after RECOVERY_TTL seconds."""
    r = await get_redis()
    deck_id = deck_id.lower()
    await set_deck_state(deck_id, status="RECOVERY")
    # Schedule auto-clear via a short TTL on the deck key
    await r.expire(_k_deck(deck_id), RECOVERY_TTL)


async def get_stream_info(deck_id: str) -> Optional[Dict]:
    r = await get_redis()
    data = await r.hgetall(_k_stream(deck_id.lower()))
    return data if data else None


# ── Zone state (pre-DJ state snapshot) ───────────────────────────────────────

async def save_zone_state(deck_id: str, source: str,
                           prev_track: Optional[str] = None,
                           prev_playlist: Optional[str] = None) -> None:
    r = await get_redis()
    mapping = {"source": source}
    if prev_track:    mapping["prev_track"]    = prev_track
    if prev_playlist: mapping["prev_playlist"] = prev_playlist
    await r.hset(_k_zone(deck_id.lower()), mapping=mapping)


async def get_zone_state(deck_id: str) -> Dict:
    r = await get_redis()
    data = await r.hgetall(_k_zone(deck_id.lower()))
    return data if data else {"source": "PLAYLIST"}


async def clear_zone_state(deck_id: str) -> None:
    r = await get_redis()
    await r.delete(_k_zone(deck_id.lower()))


# ── Recording state ───────────────────────────────────────────────────────────

async def set_recording(deck_id: str, filename: str, session_id: str) -> None:
    r = await get_redis()
    await r.hset(_k_record(deck_id.lower()), mapping={
        "filename":   filename,
        "started_at": str(time.time()),
        "session_id": session_id,
    })


async def get_recording(deck_id: str) -> Optional[Dict]:
    r = await get_redis()
    data = await r.hgetall(_k_record(deck_id.lower()))
    return data if data else None


async def clear_recording(deck_id: str) -> None:
    r = await get_redis()
    await r.delete(_k_record(deck_id.lower()))


# ── Effect state ──────────────────────────────────────────────────────────────

async def set_effect(deck_id: str, effect: str) -> None:
    r = await get_redis()
    await r.set(_k_effect(deck_id.lower()), effect)


async def get_effect(deck_id: str) -> Optional[str]:
    r = await get_redis()
    return await r.get(_k_effect(deck_id.lower()))


async def clear_effect(deck_id: str) -> None:
    r = await get_redis()
    await r.delete(_k_effect(deck_id.lower()))


# ── Utility ───────────────────────────────────────────────────────────────────

async def admin_force_release_deck(deck_id: str) -> Dict:
    """Admin override — force-release any deck regardless of owner."""
    await clear_deck_state(deck_id)
    return {"ok": True, "deck_id": deck_id, "status": "AVAILABLE"}


async def get_full_dj_state() -> Dict:
    """Snapshot of all DJ-related Redis state — used for WS FULL_STATE."""
    decks = await get_all_deck_states()
    return {
        "dj_decks": decks,
        "dj_engine": "online",
    }
