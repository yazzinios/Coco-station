"""
announcement_engine.py
======================
Sequential announcement playback engine for CocoStation.

Correct full sequence:
    1. FADE DOWN  — music fades to ducking % (from settings.ducking_percent)
    2. INTRO      — jingle plays fully (timed via ffprobe, notify=False)
    3. CONTENT    — announcement plays fully (waits for announcement_ended callback)
    4. OUTRO      — jingle plays fully (timed via ffprobe, notify=False)
    5. FADE UP    — music fades back to original volume per deck

Volume mount paths (from docker-compose.yml):
    API container    : data/chimes/       → ffprobe reads from here
    Mixer container  : /chimes/           → ffmpeg reads from here
    Announcements    : /announcements/    → ffmpeg reads from here
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import List, Optional, Dict

import httpx

# ── Injected at startup by main.py via init() ─────────────────────────────────
_FFMPEG_URL: str = ""
_CHIMES_DIR: Path = Path("data/chimes")   # API-side path for ffprobe
_SETTINGS: dict = {}
_DECKS: Dict[str, dict] = {}
_ANNOUNCEMENT_EVENTS: Dict[str, asyncio.Event] = {}
_TRIGGER_LOCK: Optional[asyncio.Lock] = None

# Mixer-side paths (as mounted in the ffmpeg-mixer container)
MIXER_CHIMES_PATH       = "/chimes"        # docker-compose: ./data/chimes:/chimes:ro
MIXER_ANNOUNCEMENTS_PATH = "/announcements" # docker-compose: ./data/announcements:/announcements:ro

# Fade config
FADE_STEPS   = 20
FADE_DOWN_MS = 60   # ms per step fading down  (~1.2 s total)
FADE_UP_MS   = 80   # ms per step fading up    (~1.6 s total)


def init(
    ffmpeg_url: str,
    chimes_dir: Path,
    settings: dict,
    decks: dict,
    announcement_events: dict,
    trigger_lock: asyncio.Lock,
) -> None:
    global _FFMPEG_URL, _CHIMES_DIR, _SETTINGS, _DECKS
    global _ANNOUNCEMENT_EVENTS, _TRIGGER_LOCK
    _FFMPEG_URL          = ffmpeg_url
    _CHIMES_DIR          = chimes_dir
    _SETTINGS            = settings
    _DECKS               = decks
    _ANNOUNCEMENT_EVENTS = announcement_events
    _TRIGGER_LOCK        = trigger_lock


# ═══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════

async def get_audio_duration(filepath: Path) -> float:
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


def _duck_pct() -> int:
    try:
        return max(0, min(100, int(_SETTINGS.get("ducking_percent", 5))))
    except Exception:
        return 5


def _mic_duck_pct() -> int:
    try:
        return max(0, min(100, int(_SETTINGS.get("mic_ducking_percent", 5))))
    except Exception:
        return 5


async def _set_volume(deck_id: str, vol: int, client: httpx.AsyncClient) -> None:
    try:
        await client.post(f"{_FFMPEG_URL}/decks/{deck_id}/volume/{vol}")
    except Exception as e:
        print(f"[engine] set_volume deck {deck_id} → {vol}: {e}")


async def _fade_volumes(
    deck_vols: Dict[str, int],
    targets: Dict[str, int],
    step_ms: int,
) -> None:
    steps   = FADE_STEPS
    delay   = step_ms / 1000.0
    current = {did: float(deck_vols[did]) for did in deck_vols}
    deltas  = {did: (targets[did] - deck_vols[did]) / steps for did in deck_vols}

    async with httpx.AsyncClient(timeout=3) as c:
        for _ in range(steps):
            tasks = []
            for did in deck_vols:
                current[did] += deltas[did]
                vol = max(0, min(100, round(current[did])))
                tasks.append(_set_volume(did, vol, c))
            await asyncio.gather(*tasks)
            await asyncio.sleep(delay)
        # Final pass — exact target values
        tasks = []
        for did, vol in targets.items():
            _DECKS[did]["volume"] = vol
            tasks.append(_set_volume(did, vol, c))
        await asyncio.gather(*tasks)


def _drain_all_events() -> None:
    """
    Clear ALL pending announcement events globally.
    Called after each jingle sleep so stale announcement_ended callbacks
    fired by old ann_proc reader threads cannot short-circuit _play_content.
    """
    stale = list(_ANNOUNCEMENT_EVENTS.keys())
    for did in stale:
        ev = _ANNOUNCEMENT_EVENTS.pop(did, None)
        if ev:
            print(f"[engine] Drained stale event for deck {did}")


async def _play_jingle(jingle_type: str, deck_ids: List[str]) -> None:
    """
    Play intro or outro jingle on the given decks and wait for it to finish.

    - Uses timed sleep (ffprobe duration on the API side).
    - Sends notify=False to the mixer — never touches _ANNOUNCEMENT_EVENTS.
    - After the sleep, drains ALL stale events so they cannot short-circuit
      the upcoming _play_content wait.

    PATH FIX: jingle files live at /chimes/<filename> inside the mixer
    container, NOT /data/chimes/<filename>.
    """
    filename = _SETTINGS.get(f"jingle_{jingle_type}")
    if not filename:
        return

    local_path = _CHIMES_DIR / filename                    # API side — for ffprobe
    mixer_path = f"{MIXER_CHIMES_PATH}/{filename}"         # Mixer side — for ffmpeg

    if not local_path.exists():
        print(f"[engine] {jingle_type} jingle missing: {local_path}")
        return

    print(f"[engine] ▶ {jingle_type} jingle: {filename}")
    print(f"[engine]   API path : {local_path}")
    print(f"[engine]   Mixer path: {mixer_path}")

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
                print(f"[engine] jingle send error deck {did}: {r}")
            elif r.status_code != 200:
                print(f"[engine] jingle mixer {r.status_code} deck {did}: {r.text}")

    duration = await get_audio_duration(local_path)
    wait_for = max(0.5, min(duration + 0.2, 60.0))
    print(f"[engine] {jingle_type} jingle duration={duration:.2f}s — waiting {wait_for:.2f}s")
    await asyncio.sleep(wait_for)

    # Drain all stale announcement_ended events that may have fired during the sleep
    _drain_all_events()


async def _play_content(filepath: str, deck_ids: List[str]) -> None:
    """
    Send announcement to the mixer and block until it finishes naturally.

    - Drains stale events before registering fresh ones.
    - Registers events ONLY for the target deck_ids.
    - Hard timeout: 120 s.

    filepath is the MIXER-side path (e.g. /announcements/foo.mp3).
    """
    # Belt-and-suspenders drain after the jingle already drained
    _drain_all_events()

    # Register fresh events for exactly the decks we're sending to
    events: List[asyncio.Event] = []
    for did in deck_ids:
        ev = asyncio.Event()
        _ANNOUNCEMENT_EVENTS[did] = ev
        events.append(ev)

    print(f"[engine] Sending announcement to decks {deck_ids}: {Path(filepath).name}")

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
                    ev = _ANNOUNCEMENT_EVENTS.pop(did, None)
                    if ev and not ev.is_set():
                        ev.set()
                    print(f"[engine] content send failed deck {did}: {r}")
    except Exception as e:
        print(f"[engine] content send error: {e}")
        for did in deck_ids:
            ev = _ANNOUNCEMENT_EVENTS.pop(did, None)
            if ev and not ev.is_set():
                ev.set()

    try:
        await asyncio.wait_for(
            asyncio.gather(*[ev.wait() for ev in events]),
            timeout=120.0,
        )
        print(f"[engine] ✓ Announcement finished on decks: {deck_ids}")
    except asyncio.TimeoutError:
        print(f"[engine] ✗ Announcement timed out (120 s) on decks {deck_ids}")
    finally:
        for did in deck_ids:
            _ANNOUNCEMENT_EVENTS.pop(did, None)

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
    Full announcement sequence:
        1. FADE DOWN  music → ducking_percent
        2. INTRO      jingle (timed, notify=False)
        3. CONTENT    announcement (waits for announcement_ended callback)
        4. OUTRO      jingle (timed, notify=False)
        5. FADE UP    music → original volumes

    deck_ids    — decks that receive announcement + jingle audio.
    all_deck_ids — decks whose volume is ducked (defaults to all playing decks).

    filepath must be the MIXER-side path (e.g. /announcements/foo.mp3).
    """
    if _TRIGGER_LOCK is None:
        raise RuntimeError("announcement_engine.init() not called")

    if _TRIGGER_LOCK.locked():
        print(f"[engine] Queuing '{Path(filepath).name}' — engine busy")

    async with _TRIGGER_LOCK:
        print(f"[engine] ══ Announcement START: {Path(filepath).name}")
        print(f"[engine]   Target decks : {deck_ids}")

        duck_level   = _duck_pct()
        duck_targets = all_deck_ids if all_deck_ids is not None else list(_DECKS.keys())
        active_decks = [
            did for did in duck_targets
            if _DECKS.get(did, {}).get("is_playing") or _DECKS.get(did, {}).get("track")
        ]
        saved_volumes: Dict[str, int] = {
            did: _DECKS.get(did, {}).get("volume", 80)
            for did in active_decks
        }

        print(f"[engine] Ducking {active_decks} {saved_volumes} → {duck_level}%")

        try:
            # Step 1: FADE DOWN
            if active_decks:
                await _fade_volumes(
                    {did: saved_volumes[did] for did in active_decks},
                    {did: duck_level for did in active_decks},
                    FADE_DOWN_MS,
                )
                print(f"[engine] ✓ Fade down → {duck_level}%")

            # Step 2: INTRO jingle (only on deck_ids, not all decks)
            await _play_jingle("intro", deck_ids)

            # Step 3: CONTENT (only on deck_ids)
            await _play_content(filepath, deck_ids)

            # Step 4: OUTRO jingle (only on deck_ids)
            await _play_jingle("outro", deck_ids)

        except Exception as e:
            print(f"[engine] Sequence error: {e}")
        finally:
            # Step 5: FADE UP — always runs
            if active_decks:
                print(f"[engine] Fading back up: {saved_volumes}")
                await _fade_volumes(
                    {did: duck_level for did in active_decks},
                    saved_volumes,
                    FADE_UP_MS,
                )
                print(f"[engine] ✓ Fade up complete")

            print(f"[engine] ══ Announcement END: {Path(filepath).name}")


async def mic_open_sequence(deck_ids: List[str]) -> None:
    """
    Mic goes live:
        1. FADE DOWN  music → mic_ducking_percent
        2. INTRO      jingle
    Lock stays held until mic_close_sequence().
    """
    if _TRIGGER_LOCK is None:
        raise RuntimeError("announcement_engine.init() not called")

    await _TRIGGER_LOCK.acquire()
    print(f"[engine] Mic OPEN — fading {deck_ids}")

    duck_level   = _mic_duck_pct()
    active_decks = [
        did for did in deck_ids
        if _DECKS.get(did, {}).get("is_playing") or _DECKS.get(did, {}).get("track")
    ]
    saved = {did: _DECKS.get(did, {}).get("volume", 80) for did in active_decks}

    global _MIC_SAVED_VOLUMES, _MIC_ACTIVE_DECKS
    _MIC_SAVED_VOLUMES = saved
    _MIC_ACTIVE_DECKS  = active_decks

    try:
        if active_decks:
            await _fade_volumes(
                {did: saved[did] for did in active_decks},
                {did: duck_level for did in active_decks},
                FADE_DOWN_MS,
            )
        await _play_jingle("intro", deck_ids)
    except Exception as e:
        print(f"[engine] mic_open error: {e}")
        try:
            _TRIGGER_LOCK.release()
        except RuntimeError:
            pass
        raise e


async def mic_close_sequence(deck_ids: List[str]) -> None:
    """
    Mic goes off:
        1. OUTRO  jingle
        2. FADE UP music → original volumes
    Releases lock.
    """
    global _MIC_SAVED_VOLUMES, _MIC_ACTIVE_DECKS
    duck_level   = _mic_duck_pct()
    active_decks = _MIC_ACTIVE_DECKS if _MIC_ACTIVE_DECKS else deck_ids
    saved        = _MIC_SAVED_VOLUMES if _MIC_SAVED_VOLUMES else {did: 80 for did in active_decks}

    try:
        await _play_jingle("outro", deck_ids)
        if active_decks:
            print(f"[engine] Mic close — fading back: {saved}")
            await _fade_volumes(
                {did: duck_level for did in active_decks},
                saved,
                FADE_UP_MS,
            )
        print(f"[engine] Mic CLOSED — volumes restored")
    finally:
        _MIC_SAVED_VOLUMES = {}
        _MIC_ACTIVE_DECKS  = []
        try:
            _TRIGGER_LOCK.release()
        except RuntimeError:
            pass


# Module-level state for mic open/close volume handoff
_MIC_SAVED_VOLUMES: Dict[str, int] = {}
_MIC_ACTIVE_DECKS:  List[str]      = []
