"""
announcement_engine.py
======================
Clean, sequential announcement playback engine for CocoStation.

Sequence for every announcement or mic feed:
    1. PAUSE   all playing decks  (SIGSTOP — no audio gap, no volume tricks)
    2. INTRO   jingle plays fully
    3. CONTENT TTS / announcement plays fully
    4. OUTRO   jingle plays fully
    5. RESUME  all paused decks   (SIGCONT)

This replaces the old duck/fade approach and the buggy parallel gather
that was launching the jingle before the duck was complete.

PATH FIX
--------
The old code built the container-side path as:
    str(Path("/chimes") / filename)          ← WRONG (volume is /data/chimes)

The correct path inside the ffmpeg-mixer container is:
    str(Path("/data/chimes") / filename)     ← CORRECT

IMPORT IN main.py
-----------------
Replace the two blocks marked OLD in main.py with:

    from announcement_engine import (
        play_announcement_sequence,
        mic_open_sequence,
        mic_close_sequence,
        get_audio_duration,
    )

Then replace every call to fade_and_play_announcement(...) with
play_announcement_sequence(...) and update fade_and_enable_mic /
fade_restore_after_mic to use mic_open_sequence / mic_close_sequence.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import List, Optional, Dict

import httpx

# ── These are injected at startup by main.py ──────────────────────────────
# Call  announcement_engine.init(...)  from inside lifespan() after the
# global state is ready.

_FFMPEG_URL: str = ""
_CHIMES_DIR: Path = Path("data/chimes")
_SETTINGS: dict = {}
_DECKS: Dict[str, dict] = {}
_ANNOUNCEMENT_EVENTS: Dict[str, asyncio.Event] = {}
_TRIGGER_LOCK: Optional[asyncio.Lock] = None


def init(
    ffmpeg_url: str,
    chimes_dir: Path,
    settings: dict,
    decks: dict,
    announcement_events: dict,
    trigger_lock: asyncio.Lock,
) -> None:
    """Call once from main.py lifespan after globals are ready."""
    global _FFMPEG_URL, _CHIMES_DIR, _SETTINGS, _DECKS
    global _ANNOUNCEMENT_EVENTS, _TRIGGER_LOCK
    _FFMPEG_URL          = ffmpeg_url
    _CHIMES_DIR          = chimes_dir
    _SETTINGS            = settings
    _DECKS               = decks
    _ANNOUNCEMENT_EVENTS = announcement_events
    _TRIGGER_LOCK        = trigger_lock


# ═══════════════════════════════════════════════════════════════════════════
#  AUDIO DURATION HELPER
# ═══════════════════════════════════════════════════════════════════════════

async def get_audio_duration(filepath: Path) -> float:
    """Return audio duration in seconds via ffprobe. Falls back to 2.5 s."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format",
            str(filepath),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        data = json.loads(stdout)
        return float(data["format"]["duration"])
    except Exception:
        return 2.5


# ═══════════════════════════════════════════════════════════════════════════
#  LOW-LEVEL MIXER HELPERS
# ═══════════════════════════════════════════════════════════════════════════

async def _pause_decks(deck_ids: List[str]) -> List[str]:
    """SIGSTOP the ffmpeg process for every playing deck.
    Returns the list of decks that were actually paused (were playing).
    """
    paused: List[str] = []
    async with httpx.AsyncClient(timeout=5) as c:
        for did in deck_ids:
            deck = _DECKS.get(did, {})
            if deck.get("is_playing"):
                try:
                    r = await c.post(f"{_FFMPEG_URL}/decks/{did}/pause")
                    if r.status_code == 200:
                        _DECKS[did]["is_playing"] = False
                        _DECKS[did]["is_paused"]  = True
                        paused.append(did)
                        print(f"[engine] Deck {did} PAUSED")
                except Exception as e:
                    print(f"[engine] pause deck {did} error: {e}")
    return paused


async def _resume_decks(deck_ids: List[str]) -> None:
    """SIGCONT the ffmpeg process for every paused deck."""
    async with httpx.AsyncClient(timeout=5) as c:
        for did in deck_ids:
            deck = _DECKS.get(did, {})
            if deck.get("is_paused"):
                try:
                    r = await c.post(f"{_FFMPEG_URL}/decks/{did}/resume")
                    if r.status_code == 200:
                        _DECKS[did]["is_playing"] = True
                        _DECKS[did]["is_paused"]  = False
                        print(f"[engine] Deck {did} RESUMED")
                except Exception as e:
                    print(f"[engine] resume deck {did} error: {e}")


async def _play_jingle(jingle_type: str, deck_ids: List[str]) -> None:
    """Play intro or outro jingle on all target decks and wait for it to finish.

    PATH FIX: files live at /data/chimes/<filename> inside the mixer container,
    NOT at /chimes/<filename> as the old code incorrectly assumed.
    """
    filename = _SETTINGS.get(f"jingle_{jingle_type}")
    if not filename:
        return  # no jingle configured — skip silently

    local_path = _CHIMES_DIR / filename        # API-side path for ffprobe
    mixer_path = f"/data/chimes/{filename}"    # ← FIXED: correct container path

    if not local_path.exists():
        print(f"[engine] {jingle_type} jingle missing on disk: {local_path}")
        return

    print(f"[engine] Playing {jingle_type} jingle: {filename}")

    # Send play_announcement to mixer for each deck
    async with httpx.AsyncClient(timeout=5) as c:
        tasks = [
            c.post(
                f"{_FFMPEG_URL}/decks/{did}/play_announcement",
                json={"filepath": mixer_path, "notify": False},
            )
            for did in deck_ids
        ]
        resps = await asyncio.gather(*tasks, return_exceptions=True)
        for did, r in zip(deck_ids, resps):
            if isinstance(r, Exception):
                print(f"[engine] jingle {jingle_type} send error deck {did}: {r}")
            elif r.status_code != 200:
                print(f"[engine] jingle {jingle_type} mixer {r.status_code} deck {did}: {r.text}")

    # Wait for the jingle to finish (duration + tiny buffer, capped at 30 s)
    duration = await get_audio_duration(local_path)
    print(f"[engine] {jingle_type} jingle duration: {duration:.2f}s")
    await asyncio.sleep(min(duration + 0.15, 30.0))


async def _play_content(filepath: str, deck_ids: List[str]) -> None:
    """Send the TTS/announcement to the mixer and wait until it finishes."""
    # Register completion events for each deck
    events: List[asyncio.Event] = []
    for did in deck_ids:
        ev = asyncio.Event()
        _ANNOUNCEMENT_EVENTS[did] = ev
        events.append(ev)

    # Send play_announcement
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            tasks = [
                c.post(
                    f"{_FFMPEG_URL}/decks/{did}/play_announcement",
                    json={"filepath": filepath, "notify": True},
                )
                for did in deck_ids
            ]
            resps = await asyncio.gather(*tasks, return_exceptions=True)
            for did, r in zip(deck_ids, resps):
                if not (isinstance(r, httpx.Response) and r.status_code == 200):
                    # Auto-complete the event if the send failed
                    ev = _ANNOUNCEMENT_EVENTS.pop(did, None)
                    if ev:
                        ev.set()
    except Exception as e:
        print(f"[engine] content send error: {e}")
        for did in deck_ids:
            ev = _ANNOUNCEMENT_EVENTS.pop(did, None)
            if ev:
                ev.set()

    # Wait for all decks to signal completion (60 s hard timeout)
    try:
        await asyncio.wait_for(
            asyncio.gather(*[ev.wait() for ev in events]),
            timeout=60.0,
        )
    except asyncio.TimeoutError:
        print("[engine] Content wait timeout (60 s)")

    for did in deck_ids:
        _ANNOUNCEMENT_EVENTS.pop(did, None)

    # Brief gap between content end and outro jingle
    await asyncio.sleep(0.3)


# ═══════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════

async def play_announcement_sequence(
    deck_ids: List[str],
    filepath: str,
    *,
    all_deck_ids: Optional[List[str]] = None,
) -> None:
    """
    Full sequential announcement sequence:

        1. PAUSE  all playing decks
        2. INTRO  jingle
        3. CONTENT (TTS / announcement)
        4. OUTRO  jingle
        5. RESUME paused decks

    `deck_ids`     — decks that receive the announcement audio.
    `all_deck_ids` — decks to pause/resume (defaults to deck_ids).
                     Pass all active deck IDs if you want music paused
                     even on decks not receiving the announcement.
    """
    if _TRIGGER_LOCK is None:
        raise RuntimeError("announcement_engine.init() not called")

    pause_targets = all_deck_ids if all_deck_ids is not None else deck_ids

    if _TRIGGER_LOCK.locked():
        print(f"[engine] Queuing '{Path(filepath).name}' — engine busy")

    async with _TRIGGER_LOCK:
        print(f"[engine] ── Announcement START: {Path(filepath).name}")
        paused_decks: List[str] = []
        try:
            # ── Step 1: PAUSE ────────────────────────────────────────────
            paused_decks = await _pause_decks(pause_targets)

            # ── Step 2: INTRO jingle ─────────────────────────────────────
            await _play_jingle("intro", deck_ids)

            # ── Step 3: CONTENT ──────────────────────────────────────────
            await _play_content(filepath, deck_ids)

            # ── Step 4: OUTRO jingle ─────────────────────────────────────
            await _play_jingle("outro", deck_ids)

        finally:
            # ── Step 5: RESUME ───────────────────────────────────────────
            if paused_decks:
                await _resume_decks(paused_decks)
            print(f"[engine] ── Announcement END: {Path(filepath).name}")


async def mic_open_sequence(deck_ids: List[str]) -> None:
    """
    Called when the mic goes live:
        1. PAUSE  all playing decks
        2. INTRO  jingle
    The lock is NOT released here — mic_close_sequence() releases it.
    """
    if _TRIGGER_LOCK is None:
        raise RuntimeError("announcement_engine.init() not called")

    await _TRIGGER_LOCK.acquire()
    print(f"[engine] Mic OPEN — pausing decks {deck_ids}")
    try:
        await _pause_decks(deck_ids)
        await _play_jingle("intro", deck_ids)
    except Exception as e:
        # If something goes wrong release the lock so we don't deadlock
        try:
            _TRIGGER_LOCK.release()
        except RuntimeError:
            pass
        raise e


async def mic_close_sequence(deck_ids: List[str]) -> None:
    """
    Called when the mic goes off:
        1. OUTRO  jingle
        2. RESUME all paused decks
    Releases the trigger lock acquired by mic_open_sequence().
    """
    try:
        await _play_jingle("outro", deck_ids)
        await _resume_decks(deck_ids)
        print(f"[engine] Mic CLOSED — decks resumed")
    finally:
        try:
            _TRIGGER_LOCK.release()
        except RuntimeError:
            pass
