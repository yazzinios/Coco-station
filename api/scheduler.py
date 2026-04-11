"""
scheduler.py — CocoStation APScheduler Engine
==============================================
Centralised scheduling module. All APScheduler logic lives here; main.py
just calls `init_scheduler(state)` once during lifespan startup.

Responsibilities
----------------
* One-off music-schedule poller (10-second interval)
* One-off announcement poller (10-second interval)
* Recurring announcement / mic CronTrigger jobs
* Recurring mixer CronTrigger jobs
* 60-second heartbeat logger
* Register / unregister helpers
* Live status endpoint helper
"""

import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

# ── Timezone — all cron jobs fire in local park time ────────────────────────
TIMEZONE = "Africa/Casablanca"

# ── Shared APScheduler instance ─────────────────────────────────────────────
ap_scheduler = AsyncIOScheduler(
    timezone=TIMEZONE,
    job_defaults={"max_instances": 1, "misfire_grace_time": 120},
)

# ── Internal references (populated by init_scheduler) ───────────────────────
_state: dict = {}


# ═══════════════════════════════════════════════════════════════════════════
#  INITIALISER
# ═══════════════════════════════════════════════════════════════════════════

def init_scheduler(state: dict) -> None:
    """
    Bind the scheduler engine to the application's shared state.

    Parameters
    ----------
    state : dict  Keys that MUST be present:
        decks, deck_playlists, announcements, music_schedules,
        recurring_schedules, recurring_mixer_schedules,
        playlists, settings, manager,
        ffmpeg_url, media_dir, announcements_dir,
        fade_and_play_announcement,   # coroutine function
        mic_on,                       # coroutine function
        db,                           # db_client instance
        trigger_lock_ref,             # list[asyncio.Lock] — mutable wrapper
        duck_refcount_ref,            # list[int]          — mutable wrapper
        duck_saved_volumes,           # dict[str, int]     — shared dict
        duck_type,                    # str key in _state  — "mic"|"announcement"
    """
    _state.update(state)


# ═══════════════════════════════════════════════════════════════════════════
#  TIME UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

def _normalize_hhmm(value: str) -> Optional[str]:
    if not value:
        return None
    value = value.strip()
    parts = value.split(":")
    if len(parts) < 2:
        return None
    return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"


def _parse_hhmm(hhmm: str):
    norm = _normalize_hhmm(hhmm)
    if not norm:
        return None, None
    h, m = norm.split(":")
    return int(h), int(m)


def _parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except Exception:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone().replace(tzinfo=None)
    return parsed


def _get_seconds_until_hhmm(target_hhmm: str, now: datetime) -> float:
    norm = _normalize_hhmm(target_hhmm)
    if not norm:
        return 999_999.0
    hh, mm = map(int, norm.split(":"))
    target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if target < now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def _get_seconds_remaining(target_dt: datetime, now: datetime) -> float:
    return (target_dt - now).total_seconds()


def format_time_left(seconds: float) -> str:
    """Human-readable countdown string."""
    if seconds <= 0:
        return "NOW"
    if seconds < 60:
        return f"{int(seconds)}s"
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    if mins < 60:
        return f"{mins}m {secs}s"
    hours = mins // 60
    rem_mins = mins % 60
    return f"{hours}h {rem_mins}m"


def _get_time_until_hhmm(target_hhmm: str) -> str:
    return format_time_left(_get_seconds_until_hhmm(target_hhmm, datetime.now()))


# ═══════════════════════════════════════════════════════════════════════════
#  DECK HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _get_deck_ids(rs: dict) -> List[str]:
    decks = _state["decks"]
    if rs.get("deck_ids"):
        return [d for d in rs["deck_ids"] if d in decks]
    if rs.get("deck_id"):
        return [rs["deck_id"]] if rs["deck_id"] in decks else []
    return []


# ═══════════════════════════════════════════════════════════════════════════
#  MUSIC-SCHEDULE TRIGGER  (one-off and recurring)
# ═══════════════════════════════════════════════════════════════════════════

async def _trigger_music_schedule(s: dict) -> None:
    """Load and play a track / playlist / multi-track on the target deck."""
    decks           = _state["decks"]
    deck_playlists  = _state["deck_playlists"]
    playlists       = _state["playlists"]
    settings        = _state["settings"]
    manager         = _state["manager"]
    ffmpeg_url      = _state["ffmpeg_url"]
    media_dir       = _state["media_dir"]
    music_schedules = _state["music_schedules"]
    duck_refcount   = _state["duck_refcount_ref"][0]

    deck_id = s.get("deck_id")
    loop    = s.get("loop", True)

    if not deck_id or deck_id not in decks:
        print(f"[scheduler] ERROR: invalid deck_id '{deck_id}' in schedule '{s.get('name')}'")
        await _state["manager"].broadcast({
            "type": "NOTIFICATION",
            "message": f"❌ Schedule '{s.get('name')}' failed: invalid deck",
            "style": "error",
        })
        return

    print(f"[scheduler] _trigger_music_schedule START — deck={deck_id} type={s.get('type')} name='{s.get('name')}'")

    current_vol = s.get("volume", 80) if s.get("type") != "multi_track" else 80
    if duck_refcount > 0:
        duck_pct = int(
            settings.get("mic_ducking_percent", 5)
            if _state["duck_type_ref"][0] == "mic"
            else settings.get("ducking_percent", 5)
        )
        _state["duck_saved_volumes"][deck_id] = current_vol
        current_vol = duck_pct
        print(f"[scheduler] Ducking active; starting {deck_id} at {duck_pct}%")

    async def _play_on_deck(filepath: str, loop_: bool) -> None:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                await c.post(f"{ffmpeg_url}/decks/{deck_id}/play",
                             json={"filepath": filepath, "loop": loop_})
                await c.post(f"{ffmpeg_url}/decks/{deck_id}/volume/{current_vol}")
        except Exception as e:
            print(f"[scheduler] HTTP error playing {deck_id}: {e}")

    stype = s["type"]

    if stype == "track":
        filename = s["target_id"]
        if not (media_dir / filename).exists():
            print(f"[scheduler] Track not found: {filename}"); return
        decks[deck_id].update({
            "track": filename, "is_playing": True, "is_paused": False,
            "is_loop": loop, "playlist_id": None, "playlist_index": None, "volume": current_vol,
        })
        await _play_on_deck(str(Path("/library") / filename), loop)

    elif stype == "playlist":
        playlist = playlists.get(s["target_id"])
        if not playlist:
            print(f"[scheduler] Playlist not found: {s['target_id']}"); return
        tracks = [t for t in playlist["tracks"] if (media_dir / t).exists()]
        if not tracks:
            print(f"[scheduler] No valid tracks in playlist: {playlist['name']}"); return
        deck_playlists[deck_id] = {"playlist_id": s["target_id"], "tracks": tracks, "index": 0, "loop": loop}
        decks[deck_id].update({
            "track": tracks[0], "is_playing": True, "is_paused": False, "is_loop": False,
            "playlist_id": s["target_id"], "playlist_index": 0, "playlist_loop": loop, "volume": current_vol,
        })
        await _play_on_deck(str(Path("/library") / tracks[0]), False)

    elif stype == "multi_track":
        tracks = [t for t in s.get("multi_tracks", []) if (media_dir / t).exists()]
        if not tracks:
            print(f"[scheduler] No valid tracks in multi_track: {s.get('name')}"); return
        deck_playlists[deck_id] = {"playlist_id": "multi_track", "tracks": tracks, "index": 0, "loop": loop}
        decks[deck_id].update({
            "track": tracks[0], "is_playing": True, "is_paused": False, "is_loop": False,
            "playlist_id": "multi_track", "playlist_index": 0, "playlist_loop": loop, "volume": current_vol,
        })
        await _play_on_deck(str(Path("/library") / tracks[0]), False)

    await manager.broadcast({"type": "DECK_STATE", "decks": list(decks.values())})
    await manager.broadcast({"type": "MUSIC_SCHEDULES_UPDATED", "schedules": music_schedules})
    await manager.broadcast({
        "type": "NOTIFICATION",
        "message": f"▶️ Now playing: {s.get('name', 'Unknown')} on Deck {deck_id.upper()}",
        "style": "success",
    })
    print(f"[scheduler] _trigger_music_schedule DONE — deck={deck_id} name='{s.get('name')}'")


# ═══════════════════════════════════════════════════════════════════════════
#  JINGLE HELPERS
# ═══════════════════════════════════════════════════════════════════════════

async def _get_audio_duration(filepath: Path) -> float:
    import json
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(filepath),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        data = json.loads(stdout)
        return float(data["format"]["duration"])
    except Exception:
        return 2.5


async def _play_library_track_on_deck(deck_id: str, filename: str) -> None:
    ffmpeg_url = _state["ffmpeg_url"]
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.post(
                f"{ffmpeg_url}/decks/{deck_id}/play_announcement",
                json={"filepath": str(Path("/library") / filename), "notify": False},
            )
    except Exception as e:
        print(f"[jingle] error playing {filename} on {deck_id}: {e}")


async def _play_jingle_and_wait(deck_id: str, filename: Optional[str]) -> None:
    if not filename:
        return
    path = _state["media_dir"] / filename
    if not path.exists():
        print(f"[jingle] file not found: {filename}"); return
    await _play_library_track_on_deck(deck_id, filename)
    try:
        duration = await _get_audio_duration(path)
        await asyncio.sleep(min(duration + 0.2, 30.0))
    except Exception:
        await asyncio.sleep(3.0)


# ═══════════════════════════════════════════════════════════════════════════
#  RECURRING MIXER TRIGGER / STOP
# ═══════════════════════════════════════════════════════════════════════════

async def _trigger_recurring_mixer_schedule(rs: dict) -> None:
    deck_ids   = _get_deck_ids(rs)
    manager    = _state["manager"]
    ffmpeg_url = _state["ffmpeg_url"]
    decks      = _state["decks"]

    if not deck_ids:
        print(f"[mixer-scheduler] No valid decks for '{rs.get('name')}'")
        await manager.broadcast({
            "type": "NOTIFICATION",
            "message": f"❌ Mixer '{rs.get('name')}' failed: no valid decks",
            "style": "error",
        })
        return

    volume = rs.get("volume", 80)
    loop   = rs.get("loop", True)

    # Step 1 — intro jingle simultaneously on all decks
    if rs.get("jingle_start"):
        await asyncio.gather(*[_play_jingle_and_wait(did, rs["jingle_start"]) for did in deck_ids])

    # Step 2 — set volume on all decks
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            await asyncio.gather(
                *[c.post(f"{ffmpeg_url}/decks/{did}/volume/{volume}") for did in deck_ids],
                return_exceptions=True,
            )
    except Exception:
        pass
    for did in deck_ids:
        decks[did]["volume"] = volume

    # Step 3 — start content on each deck
    for did in deck_ids:
        await _trigger_music_schedule({
            "deck_id":      did,
            "name":         rs.get("name", "Recurring"),
            "type":         rs["type"],
            "target_id":    rs["target_id"],
            "multi_tracks": rs.get("multi_tracks", []),
            "loop":         loop,
        })


async def _stop_recurring_mixer_schedule(rs: dict) -> None:
    deck_ids   = _get_deck_ids(rs)
    ffmpeg_url = _state["ffmpeg_url"]
    decks      = _state["decks"]
    manager    = _state["manager"]

    if not deck_ids:
        return

    fade_out = rs.get("fade_out", 3)
    steps    = max(1, fade_out * 5)
    delay    = fade_out / steps if steps else 0.1
    cur_vols = {did: decks.get(did, {}).get("volume", 80) for did in deck_ids}
    vols     = {did: float(cur_vols[did]) for did in deck_ids}
    deltas   = {did: cur_vols[did] / steps for did in deck_ids}

    try:
        async with httpx.AsyncClient(timeout=3) as c:
            for _ in range(steps):
                tasks = []
                for did in deck_ids:
                    vols[did] -= deltas[did]
                    v = max(0, round(vols[did]))
                    tasks.append(c.post(f"{ffmpeg_url}/decks/{did}/volume/{v}"))
                await asyncio.gather(*tasks, return_exceptions=True)
                await asyncio.sleep(delay)
            await asyncio.gather(
                *[c.post(f"{ffmpeg_url}/decks/{did}/volume/0") for did in deck_ids],
                return_exceptions=True,
            )
    except Exception:
        pass

    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await asyncio.gather(
                *[c.post(f"{ffmpeg_url}/decks/{did}/stop") for did in deck_ids],
                return_exceptions=True,
            )
    except Exception:
        pass

    restore_vol = rs.get("volume", 80)
    for did in deck_ids:
        decks[did].update({"is_playing": False, "is_paused": False, "volume": restore_vol})

    try:
        async with httpx.AsyncClient(timeout=3) as c:
            await asyncio.gather(
                *[c.post(f"{ffmpeg_url}/decks/{did}/volume/{restore_vol}") for did in deck_ids],
                return_exceptions=True,
            )
    except Exception:
        pass

    await manager.broadcast({"type": "DECK_STATE", "decks": list(decks.values())})

    if rs.get("jingle_end"):
        await asyncio.gather(*[_play_jingle_and_wait(did, rs["jingle_end"]) for did in deck_ids])


# ═══════════════════════════════════════════════════════════════════════════
#  APScheduler CALLBACK — Recurring Announcement / Mic
# ═══════════════════════════════════════════════════════════════════════════

async def _ap_trigger_recurring(schedule_id: str) -> None:
    recurring_schedules = _state["recurring_schedules"]
    announcements       = _state["announcements"]
    manager             = _state["manager"]
    db                  = _state["db"]
    fade_and_play       = _state["fade_and_play_announcement"]
    mic_on_fn           = _state["mic_on"]

    rs = next((x for x in recurring_schedules if x["id"] == schedule_id), None)
    if not rs:
        print(f"[scheduler] recurring_{schedule_id} — schedule not found, skipping"); return

    sname     = rs.get("name", "?")
    now       = datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    if today_str in rs.get("excluded_days", []):
        print(f"[scheduler] SKIP '{sname}': today excluded"); return
    if rs.get("last_run_date") == today_str:
        print(f"[scheduler] SKIP '{sname}': already ran today"); return

    print(f"\n{'='*60}")
    print(f"[scheduler] 🔔 TRIGGERING '{sname}' ({rs['type']}) @ {rs.get('start_time')}")
    print(f"[scheduler]    {now.strftime('%H:%M:%S')} | APScheduler CronTrigger")
    print(f"{'='*60}\n")

    rs["last_run_date"] = today_str
    asyncio.create_task(db.update_recurring_last_run(rs["id"], today_str))

    deck_ids = [d.lower() for d in rs.get("target_decks", ["A"])]
    stype    = rs["type"].lower()

    if stype in ("announcement", "recurringannouncement"):
        ann = next((a for a in announcements if a["id"] == rs.get("announcement_id")), None)
        if ann:
            filepath = str(Path("/announcements") / ann["filename"])
            asyncio.create_task(fade_and_play(deck_ids, filepath, level=rs.get("music_volume")))
            await manager.broadcast({
                "type": "NOTIFICATION",
                "message": f"🔔 Triggered: {sname} (Recurring Announcement)",
                "style": "success",
            })
        else:
            print(f"[scheduler] WARNING: announcement_id={rs.get('announcement_id')} not found for '{sname}'")
            await manager.broadcast({
                "type": "NOTIFICATION",
                "message": f"⚠️ {sname}: Announcement not found!",
                "style": "error",
            })
    elif stype in ("microphone", "recurringmicrophone"):
        from schemas import MicControlRequest  # local import avoids circular dep
        asyncio.create_task(mic_on_fn(MicControlRequest(targets=[d.upper() for d in deck_ids])))
        await manager.broadcast({
            "type": "NOTIFICATION",
            "message": f"🎙️ Triggered: {sname} (Automated Mic)",
            "style": "info",
        })

    await manager.broadcast({"type": "RECURRING_SCHEDULES_UPDATED", "schedules": recurring_schedules})


# ═══════════════════════════════════════════════════════════════════════════
#  APScheduler CALLBACK — Recurring Mixer
# ═══════════════════════════════════════════════════════════════════════════

async def _ap_trigger_mixer(schedule_id: str) -> None:
    recurring_mixer = _state["recurring_mixer_schedules"]
    manager         = _state["manager"]
    db              = _state["db"]

    rs = next((x for x in recurring_mixer if x["id"] == schedule_id), None)
    if not rs:
        print(f"[mixer-scheduler] mixer_{schedule_id} — schedule not found, skipping"); return

    sname     = rs.get("name", "?")
    now       = datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    if today_str in rs.get("excluded_days", []):
        print(f"[mixer-scheduler] SKIP '{sname}': today excluded"); return
    if rs.get("last_run_date") == today_str:
        print(f"[mixer-scheduler] SKIP '{sname}': already ran today"); return

    print(f"\n{'='*60}")
    print(f"[mixer-scheduler] 🔔 TRIGGERING '{sname}' @ {rs.get('start_time')}")
    print(f"[mixer-scheduler]    {now.strftime('%H:%M:%S')} | deck_ids={_get_deck_ids(rs)}")
    print(f"{'='*60}\n")

    rs["last_run_date"] = today_str
    asyncio.create_task(db.update_recurring_mixer_last_run(rs["id"], today_str))
    asyncio.create_task(_trigger_recurring_mixer_schedule(rs))

    await manager.broadcast({
        "type": "NOTIFICATION",
        "message": f"🎵 Triggered: {sname} (Mixer Start)",
        "style": "success",
    })
    await manager.broadcast({"type": "RECURRING_MIXER_SCHEDULES_UPDATED", "schedules": recurring_mixer})


# ═══════════════════════════════════════════════════════════════════════════
#  APScheduler INTERVAL — One-off checker (every 10 s)
# ═══════════════════════════════════════════════════════════════════════════

async def _ap_check_oneoffs() -> None:
    announcements   = _state["announcements"]
    music_schedules = _state["music_schedules"]
    manager         = _state["manager"]
    db              = _state["db"]
    fade_and_play   = _state["fade_and_play_announcement"]
    now             = datetime.now()

    # One-off announcements
    for ann in list(announcements):
        if ann.get("scheduled_at") and ann.get("status") == "Scheduled":
            scheduled_at = _parse_iso_datetime(ann["scheduled_at"])
            if scheduled_at and scheduled_at <= now:
                print(f"[scheduler] TRIGGERING one-off announcement: {ann['name']}")
                ann["status"] = "Played"
                filepath = str(Path("/announcements") / ann["filename"])
                deck_ids = (
                    ["a", "b", "c", "d"]
                    if "ALL" in ann.get("targets", ["ALL"])
                    else [t.lower() for t in ann.get("targets", [])]
                )
                asyncio.create_task(fade_and_play(deck_ids, filepath))
                asyncio.create_task(db.update_announcement_status(ann["id"], "Played"))
                await manager.broadcast({
                    "type": "NOTIFICATION",
                    "message": f"Triggered: {ann['name']}",
                    "style": "success",
                })
                await manager.broadcast({"type": "ANNOUNCEMENTS_UPDATED", "announcements": announcements})

    # One-off music schedules
    for s in list(music_schedules):
        if s.get("status") == "Scheduled" and s.get("scheduled_at"):
            scheduled_at = _parse_iso_datetime(s["scheduled_at"])
            if scheduled_at and scheduled_at <= now:
                print(f"[scheduler] TRIGGERING music schedule: {s['name']}")
                s["status"] = "Played"
                asyncio.create_task(_trigger_music_schedule(s))
                asyncio.create_task(db.update_music_schedule_status(s["id"], "Played"))
                await manager.broadcast({
                    "type": "NOTIFICATION",
                    "message": f"Scheduled Music: {s['name']}",
                    "style": "info",
                })


# ═══════════════════════════════════════════════════════════════════════════
#  APScheduler INTERVAL — Heartbeat logger (every 60 s)
# ═══════════════════════════════════════════════════════════════════════════

async def _ap_heartbeat() -> None:
    recurring_schedules = _state["recurring_schedules"]
    recurring_mixer     = _state["recurring_mixer_schedules"]
    music_schedules     = _state["music_schedules"]
    announcements       = _state["announcements"]

    now       = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    dow       = now.weekday()
    upcoming  = []

    for ann in announcements:
        if ann.get("status") == "Scheduled" and ann.get("scheduled_at"):
            dt = _parse_iso_datetime(ann["scheduled_at"])
            if dt:
                upcoming.append((_get_seconds_remaining(dt, now), f"Ann: {ann['name']}"))

    for s in music_schedules:
        if s.get("status") == "Scheduled" and s.get("scheduled_at"):
            dt = _parse_iso_datetime(s["scheduled_at"])
            if dt:
                upcoming.append((_get_seconds_remaining(dt, now),
                                 f"Music: {s['name']} (Deck {s.get('deck_id','?').upper()})"))

    for rs in recurring_schedules:
        if (rs.get("enabled") and dow in rs.get("active_days", [])
                and today_str not in rs.get("excluded_days", [])
                and rs.get("last_run_date") != today_str):
            diff = _get_seconds_until_hhmm(rs.get("start_time"), now)
            upcoming.append((diff, f"Recurring: {rs['name']} ({rs.get('start_time')})"))

    for rs in recurring_mixer:
        if (rs.get("enabled") and dow in rs.get("active_days", [])
                and today_str not in rs.get("excluded_days", [])
                and rs.get("last_run_date") != today_str):
            diff = _get_seconds_until_hhmm(rs.get("start_time"), now)
            upcoming.append((diff, f"Mixer: {rs['name']} ({rs.get('start_time')})"))

    upcoming.sort(key=lambda x: x[0])
    cron_jobs = [j for j in ap_scheduler.get_jobs() if j.id not in ("heartbeat", "oneoff_checker")]

    print(f"[scheduler] heartbeat: {now.strftime('%H:%M:%S')} | {len(upcoming)} pending | {len(cron_jobs)} cron jobs")
    for diff, desc in upcoming[:5]:
        print(f"  > Next: {desc} in {format_time_left(diff)}")
    if not upcoming:
        print("  > No pending tasks.")
    for j in cron_jobs:
        nxt = j.next_run_time.strftime("%H:%M:%S") if j.next_run_time else "None"
        print(f"  > CronJob: {j.name} → next={nxt}")


# ═══════════════════════════════════════════════════════════════════════════
#  JOB REGISTRATION HELPERS (public API used by main.py)
# ═══════════════════════════════════════════════════════════════════════════

def register_recurring_job(rs: dict) -> None:
    """Register (or replace) a CronTrigger job for a recurring announcement/mic schedule."""
    job_id = f"recurring_{rs['id']}"
    try:
        ap_scheduler.remove_job(job_id)
    except Exception:
        pass

    if not rs.get("enabled"):
        print(f"[apscheduler] '{rs.get('name')}' disabled — not registered"); return

    hour, minute = _parse_hhmm(rs.get("start_time", ""))
    if hour is None:
        print(f"[apscheduler] '{rs.get('name')}' has invalid start_time"); return

    active_days = rs.get("active_days", [])
    if not active_days:
        print(f"[apscheduler] '{rs.get('name')}' has no active_days"); return

    ap_scheduler.add_job(
        _ap_trigger_recurring,
        CronTrigger(
            day_of_week=",".join(str(d) for d in active_days),
            hour=hour,
            minute=minute,
            timezone=TIMEZONE,
        ),
        id=job_id,
        name=f"Recurring: {rs.get('name')}",
        args=[rs["id"]],
        replace_existing=True,
    )
    print(f"[apscheduler] ✓ Registered '{rs.get('name')}' → {rs.get('start_time')} on days {active_days}")


def register_mixer_job(rs: dict) -> None:
    """Register (or replace) a CronTrigger job for a recurring mixer schedule."""
    job_id = f"mixer_{rs['id']}"
    try:
        ap_scheduler.remove_job(job_id)
    except Exception:
        pass

    if not rs.get("enabled"):
        print(f"[apscheduler] Mixer '{rs.get('name')}' disabled — not registered"); return

    hour, minute = _parse_hhmm(rs.get("start_time", ""))
    if hour is None:
        print(f"[apscheduler] Mixer '{rs.get('name')}' has invalid start_time"); return

    active_days = rs.get("active_days", [])
    if not active_days:
        print(f"[apscheduler] Mixer '{rs.get('name')}' has no active_days"); return

    ap_scheduler.add_job(
        _ap_trigger_mixer,
        CronTrigger(
            day_of_week=",".join(str(d) for d in active_days),
            hour=hour,
            minute=minute,
            timezone=TIMEZONE,
        ),
        id=job_id,
        name=f"Mixer: {rs.get('name')}",
        args=[rs["id"]],
        replace_existing=True,
    )
    print(f"[apscheduler] ✓ Registered mixer '{rs.get('name')}' → {rs.get('start_time')} on days {active_days}")


def unregister_job(job_id: str) -> None:
    """Remove a job safely (ignores missing jobs)."""
    try:
        ap_scheduler.remove_job(job_id)
        print(f"[apscheduler] Removed job '{job_id}'")
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════════════
#  LIFESPAN HELPERS  (called from main.py's @asynccontextmanager lifespan)
# ═══════════════════════════════════════════════════════════════════════════

def start_scheduler(recurring_schedules: list, recurring_mixer: list) -> None:
    """Register all standard interval/cron jobs and start the scheduler."""
    ap_scheduler.add_job(
        _ap_heartbeat,
        IntervalTrigger(seconds=60),
        id="heartbeat",
        name="Heartbeat Logger",
        replace_existing=True,
    )
    ap_scheduler.add_job(
        _ap_check_oneoffs,
        IntervalTrigger(seconds=10),
        id="oneoff_checker",
        name="One-off Checker",
        replace_existing=True,
    )
    for rs in recurring_schedules:
        register_recurring_job(rs)
    for rs in recurring_mixer:
        register_mixer_job(rs)

    ap_scheduler.start()

    jobs = ap_scheduler.get_jobs()
    print(f"[apscheduler] Started with {len(jobs)} job(s) — timezone: {TIMEZONE}:")
    for j in jobs:
        nxt = j.next_run_time.strftime("%H:%M:%S") if j.next_run_time else "None"
        print(f"  > {j.id:28} | {j.name:35} | next: {nxt}")


def stop_scheduler() -> None:
    """Gracefully shut down APScheduler."""
    ap_scheduler.shutdown(wait=False)
    print("[apscheduler] Scheduler stopped.")


# ═══════════════════════════════════════════════════════════════════════════
#  STATUS ENDPOINT HELPER  (/api/scheduler/status in main.py)
# ═══════════════════════════════════════════════════════════════════════════

def get_scheduler_status() -> dict:
    """Return a JSON-serialisable snapshot of the scheduler's live state."""
    recurring_schedules = _state["recurring_schedules"]
    recurring_mixer     = _state["recurring_mixer_schedules"]
    trigger_lock        = _state["trigger_lock_ref"][0]
    duck_refcount       = _state["duck_refcount_ref"][0]

    now       = datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    def _will_run(rs: dict) -> bool:
        return (
            rs.get("enabled", False)
            and now.weekday() in rs.get("active_days", [])
            and today_str not in rs.get("excluded_days", [])
            and rs.get("last_run_date") != today_str
        )

    jobs = []
    for j in ap_scheduler.get_jobs():
        if j.id in ("heartbeat", "oneoff_checker"):
            continue
        nxt   = j.next_run_time
        tleft = ""
        if nxt:
            diff  = (nxt - now.astimezone(nxt.tzinfo)).total_seconds()
            tleft = format_time_left(diff)
        jobs.append({
            "id":        j.id,
            "name":      j.name,
            "next_run":  nxt.isoformat() if nxt else None,
            "time_left": tleft,
        })

    return {
        "time_now":         now.strftime("%H:%M:%S"),
        "today":            today_str,
        "day_of_week":      now.weekday(),
        "trigger_lock_held": trigger_lock.locked(),
        "duck_refcount":    duck_refcount,
        "active_jobs":      jobs,
        "recurring_mixer_schedules": [
            {
                "id":             rs["id"],
                "name":           rs["name"],
                "enabled":        rs.get("enabled"),
                "start_time":     rs.get("start_time"),
                "active_days":    rs.get("active_days"),
                "last_run_date":  rs.get("last_run_date"),
                "will_run_today": _will_run(rs),
                "time_until":     _get_time_until_hhmm(rs["start_time"]) if _will_run(rs) else "",
            }
            for rs in recurring_mixer
        ],
        "recurring_schedules": [
            {
                "id":             rs["id"],
                "name":           rs["name"],
                "enabled":        rs.get("enabled"),
                "start_time":     rs.get("start_time"),
                "active_days":    rs.get("active_days"),
                "last_run_date":  rs.get("last_run_date"),
                "will_run_today": _will_run(rs),
                "time_until":     _get_time_until_hhmm(rs["start_time"]) if _will_run(rs) else "",
            }
            for rs in recurring_schedules
        ],
    }
