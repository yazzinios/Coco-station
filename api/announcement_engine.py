"""
announcement_engine.py
======================
Sequential announcement playback engine for CocoStation.

Sequence for every announcement:
    1. PAUSE   all playing decks  (SIGSTOP — clean, no volume tricks)
    2. INTRO   jingle plays fully (timed via ffprobe duration)
    3. CONTENT TTS / announcement plays fully (waits for announcement_ended callback)
    4. OUTRO   jingle plays fully (timed via ffprobe duration)
    5. RESUME  all paused decks   (SIGCONT)

BUG FIXES in this version
--------------------------
1. _play_jingle now drains any stale _ANNOUNCEMENT_EVENTS for the target decks
   BEFORE sending the jingle — prevents a leftover event from a previous timed-out
   content play from satisfying the next _play_content wait instantly.

2. _play_content cleans up its own events in the finally block even on timeout,
   preventing them from leaking into subsequent steps.

3. _pause_decks no longer relies solely on the in-memory is_playing flag.
   It sends the pause to the mixer unconditionally for any deck that has a
   track set (is_playing OR is_paused), letting the mixer decide whether
   SIGSTOP is meaningful. This prevents decks that were playing but whose
   in-memory flag got out of sync from being skipped.

4. _play_jingle uses a per-deck ann_q drain on the mixer side by sending
   play_announcement with notify=False, and the mixer's own ann proc handling
   correctly terminates any previous ann subprocess before starting the new one.
   No change needed there — confirmed correct in deck_manager.py.

5. Added a minimum sleep floor of 0.5 s for jingles whose ffprobe duration
   comes back as 0 or near-zero (corrupt/short file edge case).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import List, Optional, Dict

import httpx

# ── Injected at startup by main.py ───────────────────────────────────────────
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
    """SIGSTOP the ffmpeg process for every active deck.

    FIX: We now pause any deck that has a track (is_playing OR is_paused),
    not just decks where is_playing is True. This handles cases where the
    in-memory flag is stale but audio is still streaming.

    Returns the list of decks that were sent a pause command.
    """
    paused: List[str] = []
    async with httpx.AsyncClient(timeout=5) as c:
        for did in deck_ids:
            deck = _DECKS.get(did, {})
            # Pause if playing, or if paused (in case we need to re-confirm), or if track is set
            if deck.get("is_playing") or deck.get("track"):
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


def _drain_announcement_events(deck_ids: List[str]) -> None:
    """
    FIX: Remove any stale _ANNOUNCEMENT_EVENTS entries for the given decks.

    If a previous _play_content call timed out, its events remain in the dict.
    When the next _play_content call registers new events, the wait() would
    return immediately if those events were already set (or the dict entry
    would be overwritten with a fresh unset event — which is actually safe).

    The real risk is that stale SET events from a timed-out sequence cause
    the NEW content wait to return immediately before the audio finishes.
    Draining them here ensures a clean slate before each jingle or content step.
    """
    for did in deck_ids:
        ev = _ANNOUNCEMENT_EVENTS.pop(did, None)
        if ev and ev.is_set():
            print(f"[engine] Drained stale announcement event for deck {did}")


async def _play_jingle(jingle_type: str, deck_ids: List[str]) -> None:
    """Play intro or outro jingle on all target decks and wait for it to finish.

    Uses ffprobe duration + a small buffer — does NOT use the announcement_ended
    callback (notify=False), so it never touches _ANNOUNCEMENT_EVENTS.

    FIX: Drains stale events before playing so a timed-out prior sequence
    cannot cause the subsequent _play_content to skip its wait.

    FIX: Minimum sleep of 0.5 s guards against zero-duration edge cases.
    """
    filename = _SETTINGS.get(f"jingle_{jingle_type}")
    if not filename:
        return  # no jingle configured — skip silently

    local_path = _CHIMES_DIR / filename        # API-side path for ffprobe
    mixer_path = f"/data/chimes/{filename}"    # correct path inside mixer container

    if not local_path.exists():
        print(f"[engine] {jingle_type} jingle missing on disk: {local_path}")
        return

    # FIX: drain any stale events before playing the jingle
    _drain_announcement_events(deck_ids)

    print(f"[engine] Playing {jingle_type} jingle: {filename}")

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

    # Wait for the jingle to finish (duration + buffer, minimum 0.5 s, capped at 30 s)
    duration = await get_audio_duration(local_path)
    wait_for = max(0.5, min(duration + 0.2, 30.0))
    print(f"[engine] {jingle_type} jingle duration: {duration:.2f}s — waiting {wait_for:.2f}s")
    await asyncio.sleep(wait_for)


async def _play_content(filepath: str, deck_ids: List[str]) -> None:
    """Send the TTS/announcement to the mixer and wait until it finishes.

    FIX: The finally block now always cleans up _ANNOUNCEMENT_EVENTS for
    these decks, preventing stale set-events from leaking into the next step.
    """
    # FIX: drain any stale events from a prior sequence before registering new ones
    _drain_announcement_events(deck_ids)

    # Register fresh completion events for each deck
    events: List[asyncio.Event] = []
    for did in deck_ids:
        ev = asyncio.Event()
        _ANNOUNCEMENT_EVENTS[did] = ev
        events.append(ev)

    # Send play_announcement with notify=True so mixer calls /api/internal/announcement_ended
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
                    # Send failed — auto-complete so we don't hang forever
                    ev = _ANNOUNCEMENT_EVENTS.pop(did, None)
                    if ev and not ev.is_set():
                        ev.set()
                    print(f"[engine] content send failed for deck {did}: {r}")
    except Exception as e:
        print(f"[engine] content send error: {e}")
        for did in deck_ids:
            ev = _ANNOUNCEMENT_EVENTS.pop(did, None)
            if ev and not ev.is_set():
                ev.set()

    # Wait for all decks to signal completion (60 s hard timeout)
    try:
        await asyncio.wait_for(
            asyncio.gather(*[ev.wait() for ev in events]),
            timeout=60.0,
        )
        print(f"[engine] Content finished on all decks: {deck_ids}")
    except asyncio.TimeoutError:
        print(f"[engine] Content wait timeout (60 s) for decks {deck_ids}")
    finally:
        # FIX: always clean up our events so they never leak into the next step
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
        2. INTRO  jingle  (timed sleep, no callback)
        3. CONTENT (TTS / announcement)  (waits for announcement_ended callback)
        4. OUTRO  jingle  (timed sleep, no callback)
        5. RESUME paused decks

    `deck_ids`     — decks that receive the announcement audio.
    `all_deck_ids` — decks to pause/resume (defaults to deck_ids).
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
            # Step 1: PAUSE
            paused_decks = await _pause_decks(pause_targets)

            # Step 2: INTRO jingle
            await _play_jingle("intro", deck_ids)

            # Step 3: CONTENT
            await _play_content(filepath, deck_ids)

            # Step 4: OUTRO jingle
            await _play_jingle("outro", deck_ids)

        except Exception as e:
            print(f"[engine] Announcement sequence error: {e}")
        finally:
            # Step 5: RESUME — always runs even if something above failed
            if paused_decks:
                await _resume_decks(paused_decks)
            print(f"[engine] ── Announcement END: {Path(filepath).name}")


async def mic_open_sequence(deck_ids: List[str]) -> None:
    """
    Called when the mic goes live:
        1. PAUSE  all playing decks
        2. INTRO  jingle
    Lock is NOT released here — mic_close_sequence() releases it.
    """
    if _TRIGGER_LOCK is None:
        raise RuntimeError("announcement_engine.init() not called")

    await _TRIGGER_LOCK.acquire()
    print(f"[engine] Mic OPEN — pausing decks {deck_ids}")
    try:
        await _pause_decks(deck_ids)
        await _play_jingle("intro", deck_ids)
    except Exception as e:
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
