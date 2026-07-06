import os
import subprocess
import threading
import time
import uuid
import queue
import audioop
import signal
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
import uvicorn
from pydantic import BaseModel
from typing import Optional, List, Dict

MEDIAMTX_HOST = os.getenv("MEDIAMTX_HOST", "mediamtx")
RTMP_BASE_URL  = f"rtmp://{MEDIAMTX_HOST}:1935"
API_HOST       = os.getenv("API_HOST", "api")
API_URL        = f"http://{API_HOST}:8000"


def _notify_track_ended(deck_name: str):
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{API_URL}/api/decks/{deck_name}/track_ended",
            data=b"", method="POST"
        )
        with urllib.request.urlopen(req, timeout=3):
            pass
    except Exception as e:
        print(f"[deck {deck_name}] track_ended notify failed: {e}")

def _notify_announcement_ended(deck_name: str):
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{API_URL}/api/internal/announcement_ended/{deck_name}",
            data=b"", method="POST"
        )
        with urllib.request.urlopen(req, timeout=3):
            pass
    except Exception as e:
        print(f"[deck {deck_name}] announcement_ended notify failed: {e}")

def _notify_dead_air(deck_name: str):
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{API_URL}/api/decks/{deck_name}/dead_air",
            data=b"", method="POST"
        )
        with urllib.request.urlopen(req, timeout=3):
            pass
    except Exception as e:
        print(f"[deck {deck_name}] dead_air notify failed: {e}")

CHUNK_SIZE     = 4096
SAMPLE_RATE    = 44100
CHANNELS       = 2
SAMPWIDTH      = 2  # 16-bit
CHUNK_DURATION = CHUNK_SIZE / (SAMPLE_RATE * CHANNELS * SAMPWIDTH)  # ~0.0232 s

# Crossfade config
CROSSFADE_DURATION = float(os.getenv("CROSSFADE_DURATION", "3.0"))
CROSSFADE_CHUNKS   = max(1, round(CROSSFADE_DURATION / CHUNK_DURATION))

# ─────────────────────────────────────────────────────────────────
#  SYNC PRECISION
#  Measures real ffmpeg startup latency by spawning a probe process
#  and timing how long until the first PCM byte arrives.
#  Used by clone_sync() to compensate for decode pipeline startup.
# ─────────────────────────────────────────────────────────────────
_FFMPEG_STARTUP_CACHE: Optional[float] = None
_FFMPEG_STARTUP_LOCK  = threading.Lock()

def _measure_ffmpeg_startup(filepath: str) -> float:
    """
    Spawn ffmpeg on the actual target file, time until first byte of PCM
    arrives.  Result is cached after the first measurement.
    Returns latency in seconds (clamped 0.05–1.0).
    """
    global _FFMPEG_STARTUP_CACHE
    with _FFMPEG_STARTUP_LOCK:
        if _FFMPEG_STARTUP_CACHE is not None:
            return _FFMPEG_STARTUP_CACHE

    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", filepath,
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS),
            "-t", "0.5",          # decode only 0.5 s of audio
            "pipe:1",
        ]
        t0   = time.monotonic()
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        proc.stdout.read(CHUNK_SIZE)   # block until first chunk arrives
        latency = time.monotonic() - t0
        proc.terminate()
        proc.wait(timeout=2)
    except Exception:
        latency = 0.25   # safe default

    latency = max(0.05, min(1.0, latency))
    with _FFMPEG_STARTUP_LOCK:
        _FFMPEG_STARTUP_CACHE = latency

    print(f"[sync] Measured ffmpeg startup latency: {latency*1000:.0f} ms")
    return latency


class EffectProcessor:
    def __init__(self):
        self.buffer = []
        self.max_buffer_size = 30  # ~0.7 seconds of delay at CHUNK_DURATION

    def process(self, chunk: bytes, effect_type: str) -> bytes:
        if effect_type == "none" or not effect_type:
            return chunk

        self.buffer.append(chunk)
        if len(self.buffer) > self.max_buffer_size:
            self.buffer.pop(0)

        if effect_type == "echo":
            # Echo: Mix in a chunk from 15 steps ago (~350ms delay) at 40% volume
            if len(self.buffer) >= 15:
                delayed = self.buffer[-15]
                try:
                    delayed_scaled = audioop.mul(delayed, SAMPWIDTH, 0.4)
                    return audioop.add(chunk, delayed_scaled, SAMPWIDTH)
                except Exception:
                    return chunk
            return chunk

        elif effect_type == "reverb":
            # Reverb: Mix in multiple decaying delayed reflections
            out = chunk
            reflections = [(5, 0.3), (10, 0.2), (15, 0.1)]
            for delay_steps, volume in reflections:
                if len(self.buffer) >= delay_steps:
                    delayed = self.buffer[-delay_steps]
                    try:
                        delayed_scaled = audioop.mul(delayed, SAMPWIDTH, volume)
                        out = audioop.add(out, delayed_scaled, SAMPWIDTH)
                    except Exception:
                        pass
            return out

        return chunk


class Deck:
    def __init__(self, name):
        self.name            = name
        self.lock            = threading.Lock()
        self.volume          = 100
        self.duck_volume     = 100
        self.is_playing      = False
        self.is_loop         = False
        self.current_track   = None
        self._stop_requested = False

        self.track_proc = None
        self.ann_proc   = None
        self._ann_notify     = False
        self._ann_generation = 0

        self._mic_last_active = 0.0
        self._mic_holdoff     = 0.8

        # Effects & Recording
        self.effect_processor = EffectProcessor()
        self.active_effect    = "none"
        self.recording_proc   = None
        self.recording_file   = None

        # ── Precise position tracking ──────────────────────────────
        # _play_started_at : monotonic clock when first PCM chunk was written
        #                    (set AFTER ffmpeg startup, not at Popen time)
        # _seek_offset     : seek position requested (seconds)
        # Together: elapsed = (monotonic() - _play_started_at) + _seek_offset
        self._play_started_at = 0.0   # monotonic
        self._seek_offset     = 0.0   # seconds already consumed before start

        self.track_q = queue.Queue(maxsize=500)
        self.ann_q   = queue.Queue(maxsize=2000)  # FIX: was 200 (~4.6s) → 2000 (~46s); prevents audio cutoff on long announcements
        self.mic_q   = queue.Queue(maxsize=100)

        # Crossfade state
        self._xfade_q    = queue.Queue(maxsize=600)
        self._xfade_pos  = 0
        self._xfade_total= 0
        self._xfade_lock = threading.Lock()
        self._xfade_proc = None

        # Dead-air watchdog
        self._last_audio_at    = time.time()
        self._dead_air_seconds = float(os.getenv("DEAD_AIR_SECONDS", "15"))
        self._dead_air_fired   = False

        self.stream_proc = None
        self._last_track_chunk = b'\x00' * CHUNK_SIZE
        self._start_master_stream()

        self.mixer_thread    = threading.Thread(target=self._mix_loop,    daemon=True)
        self.watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self.mixer_thread.start()
        self.watchdog_thread.start()

    # ── position reporting ─────────────────────────────────────────
    @property
    def elapsed_seconds(self) -> float:
        """Best-effort elapsed position, corrected for seek offset."""
        if not self.is_playing or self._play_started_at == 0.0:
            return 0.0
        return max(0.0, (time.monotonic() - self._play_started_at) + self._seek_offset)

    def _start_master_stream(self):
        rtmp_url = f"{RTMP_BASE_URL}/deck-{self.name}"
        cmd = [
            "ffmpeg", "-y",
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "-i", "pipe:0",
            "-c:a", "aac", "-b:a", "128k", "-f", "flv", rtmp_url,
        ]
        self.stream_proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        print(f"[Deck {self.name}] Master RTMP stream started → {rtmp_url}")

    @staticmethod
    def _ease(t: float) -> float:
        return t * t * (3.0 - 2.0 * t)

    def _mix_loop(self):
        silence   = b'\x00' * CHUNK_SIZE
        next_tick = time.time()
        while True:
            now       = time.time()
            sleep_for = next_tick - now
            if sleep_for > 0:
                time.sleep(sleep_for)
            next_tick += CHUNK_DURATION

            track_chunk = silence
            try:
                track_chunk = self.track_q.get(timeout=CHUNK_DURATION * 0.5)
                self._last_track_chunk = track_chunk
            except queue.Empty:
                if self.is_playing:
                    track_chunk = self._last_track_chunk

            # ── Crossfade blend ───────────────────────────────────────────
            with self._xfade_lock:
                xfade_active = self._xfade_total > 0
                xfade_pos    = self._xfade_pos
                xfade_total  = self._xfade_total

            if xfade_active:
                try:
                    xfade_chunk = self._xfade_q.get_nowait()
                except queue.Empty:
                    xfade_chunk = silence

                t        = self._ease(min(xfade_pos / max(xfade_total, 1), 1.0))
                fade_out = 1.0 - t
                fade_in  = t

                try:
                    out_scaled  = audioop.mul(track_chunk, SAMPWIDTH, fade_out) if track_chunk != silence else silence
                    in_scaled   = audioop.mul(xfade_chunk, SAMPWIDTH, fade_in)  if xfade_chunk != silence else silence
                    track_chunk = audioop.add(out_scaled, in_scaled, SAMPWIDTH)
                except Exception:
                    pass

                with self._xfade_lock:
                    self._xfade_pos += 1
                    if self._xfade_pos >= xfade_total:
                        self._xfade_total = 0
                        self._xfade_pos   = 0
                        self._promote_xfade_track()

            ann_chunk = silence
            try:
                ann_chunk = self.ann_q.get_nowait()
            except queue.Empty:
                pass

            mic_chunk  = silence
            mic_active = False
            try:
                mic_chunk = self.mic_q.get_nowait()
                self._mic_last_active = time.time()
                mic_active = True
            except queue.Empty:
                pass

            if not mic_active and (time.time() - self._mic_last_active) < self._mic_holdoff:
                mic_active = True

            vol_factor = self.volume / 100.0
            if mic_active:
                vol_factor *= self.duck_volume / 100.0
            if vol_factor != 1.0 and track_chunk != silence:
                try:
                    track_chunk = audioop.mul(track_chunk, SAMPWIDTH, vol_factor)
                except Exception:
                    pass

            mixed = silence
            try:
                mixed = audioop.add(track_chunk, ann_chunk, SAMPWIDTH)
                mixed = audioop.add(mixed, mic_chunk, SAMPWIDTH)
            except Exception:
                pass

            # Apply audio effects (reverb / echo)
            try:
                mixed = self.effect_processor.process(mixed, self.active_effect)
            except Exception as e:
                pass

            # Write to recording process if active
            rec_proc = None
            with self.lock:
                rec_proc = self.recording_proc
            if rec_proc:
                try:
                    if rec_proc.stdin and rec_proc.poll() is None:
                        rec_proc.stdin.write(mixed)
                except Exception:
                    pass

            try:
                if self.stream_proc and self.stream_proc.stdin:
                    self.stream_proc.stdin.write(mixed)
                    if mixed != silence:
                        self._last_audio_at  = time.time()
                        self._dead_air_fired = False
            except (BrokenPipeError, OSError):
                print(f"[Deck {self.name}] Broken pipe — restarting RTMP stream")
                self._start_master_stream()
                next_tick = time.time()

    def _watchdog_loop(self):
        CHECK_INTERVAL = 1.0
        while True:
            time.sleep(CHECK_INTERVAL)
            if not self.is_playing:
                self._last_audio_at  = time.time()
                self._dead_air_fired = False
                continue
            silent_for = time.time() - self._last_audio_at
            if silent_for >= self._dead_air_seconds and not self._dead_air_fired:
                self._dead_air_fired = True
                print(f"[Deck {self.name}] ⚠ Dead air detected ({silent_for:.1f}s) — notifying API")
                threading.Thread(
                    target=_notify_dead_air, args=(self.name,), daemon=True
                ).start()

    def _promote_xfade_track(self):
        with self.lock:
            old_proc = self.track_proc
            if old_proc and old_proc.poll() is None:
                try:
                    old_proc.terminate()
                    old_proc.wait(timeout=1)
                except Exception:
                    pass
            self.track_proc  = self._xfade_proc
            self._xfade_proc = None

            drained = 0
            while not self.track_q.empty():
                try:
                    self.track_q.get_nowait(); drained += 1
                except Exception:
                    break

            moved = 0
            while not self._xfade_q.empty():
                try:
                    chunk = self._xfade_q.get_nowait()
                    self.track_q.put_nowait(chunk); moved += 1
                except Exception:
                    break

            self._last_track_chunk = b'\x00' * CHUNK_SIZE
            print(f"[Deck {self.name}] Crossfade complete — promoted new track "
                  f"(drained {drained} old, moved {moved} new chunks)")

    def _reader_thread(self, proc, q, proc_name, ready_event=None, release_event=None, release_at_map=None):
        first_chunk = True
        try:
            while proc and proc.poll() is None:
                chunk = proc.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                if len(chunk) < CHUNK_SIZE:
                    chunk += b'\x00' * (CHUNK_SIZE - len(chunk))
                if first_chunk:
                    first_chunk = False
                    if ready_event is not None or release_event is not None:
                        # ── Multi-deck synchronized start ────────────────
                        # This deck's decode pipeline just produced its first PCM
                        # chunk — past subprocess spawn + codec init, the real
                        # source of cross-deck skew. Signal we're primed, wait
                        # for the group to be ready, then hold for this deck's
                        # own calibrated release instant (release_at_map) so
                        # zones with slower downstream paths (fiber length,
                        # decoder chain, speaker distance) start earlier than
                        # faster ones — see MULTIZONE_SYNC_PLAN.md.
                        if ready_event is not None:
                            ready_event.set()
                        if release_event is not None:
                            release_event.wait(timeout=2.0)
                        if release_at_map is not None:
                            target = release_at_map.get(self.name)
                            if target is not None:
                                remaining = target - time.monotonic()
                                if remaining > 0:
                                    time.sleep(remaining)
                    # ── Precise start timestamp: record when audio actually
                    # starts flowing (after any sync gating above, not at
                    # Popen time) ──
                    if proc_name == "track":
                        with self.lock:
                            self._play_started_at = time.monotonic()
                try:
                    q.put(chunk, timeout=2)
                except queue.Full:
                    # FIX: log ann_q overflow so we can diagnose cutoffs
                    if proc_name in ("ann", "jingle"):
                        print(f"[Deck {self.name}] ⚠ ann_q FULL — chunk dropped for {proc_name}")
        except Exception:
            pass
        finally:
            if proc_name == "track":
                was_stopped_manually = self._stop_requested
                with self.lock:
                    self.is_playing    = False
                    self.current_track = None
                if not was_stopped_manually:
                    threading.Thread(
                        target=_notify_track_ended, args=(self.name,), daemon=True
                    ).start()
            elif proc_name == "ann":
                my_generation      = getattr(proc, "_ann_generation", None)
                current_generation = self._ann_generation
                if my_generation is None or my_generation == current_generation:
                    # FIX: Wait until ann_q is fully drained before notifying.
                    # This ensures the last audio chunks are actually played out
                    # before the API is told the announcement ended (which would
                    # trigger music resume / jingle crossfade and cut off the tail).
                    def _wait_and_notify(deck_ref, gen):
                        deadline = time.time() + 10.0  # safety timeout
                        while time.time() < deadline:
                            if deck_ref.ann_q.empty():
                                break
                            time.sleep(CHUNK_DURATION * 2)
                        # Only notify if no newer announcement has started
                        if gen is None or gen == deck_ref._ann_generation:
                            _notify_announcement_ended(deck_ref.name)
                    threading.Thread(
                        target=_wait_and_notify, args=(self, my_generation), daemon=True
                    ).start()

    def crossfade_to(self, filepath: str, loop: bool = False,
                      duration: float = CROSSFADE_DURATION):
        if not self.is_playing or not self.current_track:
            self.play(filepath, loop=loop)
            return

        with self._xfade_lock:
            if self._xfade_proc and self._xfade_proc.poll() is None:
                try:
                    self._xfade_proc.terminate()
                    self._xfade_proc.wait(timeout=1)
                except Exception:
                    pass
            self._xfade_proc  = None
            self._xfade_total = 0
            self._xfade_pos   = 0
            while not self._xfade_q.empty():
                try: self._xfade_q.get_nowait()
                except: pass

        total_chunks = max(1, round(duration / CHUNK_DURATION))

        if loop:
            cmd = ["ffmpeg", "-y", "-stream_loop", "-1",
                   "-i", filepath,
                   "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1"]
        else:
            cmd = ["ffmpeg", "-y",
                   "-i", filepath,
                   "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1"]

        xproc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

        with self.lock:
            self._xfade_proc = xproc

        def _xfade_reader():
            try:
                while xproc.poll() is None:
                    chunk = xproc.stdout.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    if len(chunk) < CHUNK_SIZE:
                        chunk += b'\x00' * (CHUNK_SIZE - len(chunk))
                    try:
                        self._xfade_q.put(chunk, timeout=2)
                    except queue.Full:
                        pass
            except Exception:
                pass

        threading.Thread(target=_xfade_reader, daemon=True).start()

        with self._xfade_lock:
            self._xfade_pos   = 0
            self._xfade_total = total_chunks

        with self.lock:
            self.current_track    = filepath
            self.is_loop          = loop
            # For crossfade, reset position tracking
            self._play_started_at = time.monotonic()
            self._seek_offset     = 0.0

        print(f"[Deck {self.name}] Crossfade → {filepath} "
              f"(duration={duration:.1f}s, chunks={total_chunks})")

    def play(self, filepath, loop: bool = False, seek_seconds: float = 0.0,
             ready_event=None, release_event=None, release_at_map=None):
        self.stop()
        self._stop_requested = False

        with self.lock:
            self.is_playing       = True
            self.is_loop          = loop
            self.current_track    = filepath
            # Conservative estimate — _reader_thread overwrites with real value
            # once first PCM chunk arrives (after any sync gating).
            self._play_started_at = time.monotonic()
            self._seek_offset     = seek_seconds

        cmd = ["ffmpeg", "-y"]
        if seek_seconds > 0:
            cmd += ["-ss", f"{seek_seconds:.4f}"]   # 4-decimal precision
        if loop:
            cmd += ["-stream_loop", "-1"]
        cmd += [
            "-i", filepath,
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1",
        ]
        self.track_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        threading.Thread(
            target=self._reader_thread,
            args=(self.track_proc, self.track_q, "track", ready_event, release_event, release_at_map),
            daemon=True,
        ).start()
        print(f"[Deck {self.name}] Playing: {filepath} (loop={loop}, seek={seek_seconds:.4f}s)")

    def pause(self):
        with self.lock:
            if self.track_proc and self.track_proc.poll() is None:
                try:
                    self.track_proc.send_signal(signal.SIGSTOP)
                except Exception:
                    pass
            self.is_playing = False

    def resume(self):
        with self.lock:
            if self.track_proc and self.track_proc.poll() is None:
                try:
                    self.track_proc.send_signal(signal.SIGCONT)
                except Exception:
                    pass
            self.is_playing = True

    def stop(self):
        with self.lock:
            self._stop_requested = True
            if self.track_proc and self.track_proc.poll() is None:
                try:
                    self.track_proc.terminate()
                    self.track_proc.wait(timeout=2)
                except Exception:
                    pass
            self.track_proc        = None
            self.is_playing        = False
            self.is_loop           = False
            self.current_track     = None
            self._last_track_chunk = b'\x00' * CHUNK_SIZE
            self._play_started_at  = 0.0
            self._seek_offset      = 0.0
            while not self.track_q.empty():
                try: self.track_q.get_nowait()
                except: pass

    def set_volume(self, vol):
        with self.lock:
            self.volume = max(0, min(100, vol))

    def set_ducking(self, vol):
        with self.lock:
            self.duck_volume = max(0, min(100, vol))

    def fade_volume(self, target_volume: int, duration: float = 3.0):
        def _run():
            start_vol = self.volume
            steps = 30
            delay = duration / steps
            for i in range(steps + 1):
                t = i / steps
                current_vol = int(start_vol + (target_volume - start_vol) * t)
                self.set_volume(current_vol)
                time.sleep(delay)
        threading.Thread(target=_run, daemon=True).start()

    def set_effect(self, effect_name: str):
        with self.lock:
            self.active_effect = effect_name

    def record_start(self, filename: str):
        self.record_stop()
        os.makedirs("/recordings", exist_ok=True)
        filepath = os.path.join("/recordings", filename)
        cmd = [
            "ffmpeg", "-y",
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "-i", "pipe:0",
            "-c:a", "libmp3lame", "-b:a", "192k", filepath
        ]
        with self.lock:
            self.recording_file = filepath
            self.recording_proc = subprocess.Popen(
                cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        print(f"[Deck {self.name}] Recording started → {filepath}")

    def record_stop(self):
        proc = None
        with self.lock:
            proc = self.recording_proc
            self.recording_proc = None
            self.recording_file = None
        if proc:
            try:
                if proc.stdin:
                    proc.stdin.close()
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                pass
            print(f"[Deck {self.name}] Recording stopped")

    def cancel_xfade(self):
        with self._xfade_lock:
            if self._xfade_total == 0:
                return
            self._xfade_total = 0
            self._xfade_pos   = 0

        proc = None
        with self.lock:
            proc = self._xfade_proc
            self._xfade_proc = None
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=1)
            except Exception:
                pass

        while not self._xfade_q.empty():
            try: self._xfade_q.get_nowait()
            except: pass

        print(f"[Deck {self.name}] Crossfade cancelled — outgoing track continues")

    def play_announcement(self, filepath, notify: bool = True, ready_event=None, release_event=None, release_at_map=None):
        self.cancel_xfade()

        with self.lock:
            if self.ann_proc and self.ann_proc.poll() is None:
                try:
                    self.ann_proc.terminate()
                    self.ann_proc.wait(timeout=2)
                except Exception:
                    pass
            self.ann_proc = None

            # FIX: only drain ann_q when starting a NEW announcement (notify=True).
            # When playing a jingle (notify=False), do NOT drain — the previous
            # jingle's chunks may still be playing and draining them causes cutoff.
            if notify:
                drained = 0
                while not self.ann_q.empty():
                    try:
                        self.ann_q.get_nowait(); drained += 1
                    except Exception:
                        break
                if drained:
                    print(f"[Deck {self.name}] Drained {drained} stale ann_q chunks")

            self._ann_generation += 1
            current_gen      = self._ann_generation
            self._ann_notify = notify

        cmd = [
            "ffmpeg", "-y", "-v", "error", "-i", filepath,
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1",
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        proc._ann_generation = current_gen

        with self.lock:
            self.ann_proc = proc

        proc_name = "ann" if notify else "jingle"

        def _ann_stderr_logger(p, name, fpath):
            try:
                stderr_data = p.stderr.read()
                if stderr_data:
                    print(f"[Deck {name}] FFMPEG ERROR playing {fpath}: {stderr_data.decode().strip()}")
            except Exception:
                pass

        threading.Thread(
            target=self._reader_thread,
            args=(proc, self.ann_q, proc_name, ready_event, release_event, release_at_map),
            daemon=True,
        ).start()
        threading.Thread(
            target=_ann_stderr_logger,
            args=(proc, self.name, filepath),
            daemon=True,
        ).start()

        print(f"[Deck {self.name}] Announcement/Jingle started: {filepath} (notify={notify}, gen={current_gen})")

    # ── Precision sync helper ──────────────────────────────────────
    def clone_sync(self, filepath: str, loop: bool = False, volume: int = 100) -> float:
        """
        Start this deck at the exact same audio position as the source.

        Strategy:
        1. Read current elapsed from the *source* deck (caller provides it
           via the API layer, already snapshotted atomically).
        2. Measure ffmpeg startup latency for this file (cached after first run).
        3. seek_to = elapsed + startup_latency
        4. Start playback.

        Returns the seek position used (for logging / debugging).
        """
        # This method is called from the API endpoint with a pre-snapshotted
        # elapsed value; the latency measurement happens here so it's as close
        # to the actual play() call as possible.
        startup_latency = _measure_ffmpeg_startup(filepath)
        return startup_latency   # API adds this to elapsed and calls play()


# ── Initialise decks ─────────────────────────────────────────
decks: dict = {name: Deck(name) for name in ["a", "b", "c", "d", "e", "f"]}
mic_sessions: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for deck in decks.values():
        deck.stop()
        if deck.stream_proc and deck.stream_proc.poll() is None:
            deck.stream_proc.terminate()


app = FastAPI(lifespan=lifespan)


# ── Request models ────────────────────────────────────────────
class PlayRequest(BaseModel):
    filepath: str
    loop: bool = False
    seek_seconds: float = 0.0

class PlayAnnouncementRequest(BaseModel):
    filepath: str
    notify: bool = True

class SyncAnnounceRequest(BaseModel):
    """Start the same announcement/jingle on multiple decks at the same instant."""
    deck_ids: List[str]
    filepath: str
    notify: bool = True
    offsets_ms: Dict[str, int] = {}   # deck_id -> calibration offset, see MULTIZONE_SYNC_PLAN.md

class SyncPlayRequest(BaseModel):
    """Start plain track playback on multiple decks at the same calibrated instant."""
    deck_ids: List[str]
    filepath: str
    loop: bool = False
    seek_seconds: Dict[str, float] = {}   # deck_id -> per-deck seek position
    offsets_ms: Dict[str, int] = {}       # deck_id -> calibration offset

class CrossfadeRequest(BaseModel):
    filepath: str
    loop: bool = False
    duration: float = CROSSFADE_DURATION

class LoopRequest(BaseModel):
    loop: bool = False

class MicStreamStartRequest(BaseModel):
    targets: list
    ducking: int = 20

class MicStreamStopRequest(BaseModel):
    session_id: str


# ── Deck endpoints ────────────────────────────────────────────
@app.post("/decks/{deck_id}/play")
def play_track(deck_id: str, req: PlayRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].play(req.filepath, loop=req.loop, seek_seconds=req.seek_seconds)
    return {"status": "ok", "deck": deck_id, "filepath": req.filepath, "loop": req.loop}


@app.get("/decks/{deck_id}/position")
def get_position(deck_id: str):
    """
    Return the precise elapsed playback position for the current track.

    Uses monotonic clock corrected for seek offset and actual first-PCM-chunk
    timestamp (set in _reader_thread), NOT the Popen timestamp.  This is the
    most accurate position available without querying ffmpeg internals.
    """
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    d = decks[deck_id]
    if not d.is_playing or not d.current_track:
        return {"deck": deck_id, "elapsed": 0.0, "is_playing": False}
    elapsed = d.elapsed_seconds
    return {
        "deck":       deck_id,
        "elapsed":    round(elapsed, 3),   # 1 ms precision
        "is_playing": True,
        "track":      d.current_track,
        "seek_offset": round(d._seek_offset, 3),
    }


@app.get("/decks/{deck_id}/sync_probe")
def sync_probe(deck_id: str):
    """
    Two-in-one endpoint used by the clone/sync flow:
    1. Returns current elapsed position of the source deck.
    2. Returns the measured ffmpeg startup latency for that deck's current file.

    The API layer adds both values to compute the precise seek target for
    the destination deck, then fires the play() call immediately.

    This eliminates the HTTP round-trip guesswork that caused the ~0.3 s
    constant offset in the old implementation.
    """
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    d = decks[deck_id]
    if not d.is_playing or not d.current_track:
        raise HTTPException(status_code=400, detail=f"Deck {deck_id} is not playing")

    # Snapshot elapsed BEFORE measuring startup (startup probe takes ~50–300 ms)
    elapsed_before = d.elapsed_seconds

    # Measure startup latency (uses cache after first call, ~0 ms overhead)
    startup_latency = _measure_ffmpeg_startup(d.current_track)

    # Snapshot elapsed AFTER measurement — use average to cancel probe time
    elapsed_after = d.elapsed_seconds
    elapsed       = (elapsed_before + elapsed_after) / 2.0

    return {
        "deck":            deck_id,
        "elapsed":         round(elapsed, 3),
        "startup_latency": round(startup_latency, 3),
        "seek_to":         round(elapsed + startup_latency, 3),
        "track":           d.current_track,
        "is_playing":      True,
    }


@app.post("/decks/{deck_id}/pause")
def pause_track(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].pause()
    return {"status": "ok", "deck": deck_id}

@app.post("/decks/{deck_id}/resume")
def resume_track(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].resume()
    return {"status": "ok", "deck": deck_id}

@app.post("/decks/{deck_id}/stop")
def stop_track(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].stop()
    return {"status": "ok"}

@app.post("/decks/{deck_id}/loop")
def set_loop(deck_id: str, req: LoopRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    deck = decks[deck_id]
    if deck.is_playing and deck.current_track:
        deck.play(deck.current_track, loop=req.loop)
    else:
        deck.is_loop = req.loop
    return {"status": "ok", "deck": deck_id, "loop": req.loop}

@app.post("/decks/{deck_id}/volume/{level}")
def set_volume(deck_id: str, level: int):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].set_volume(level)
    return {"status": "ok", "volume": level}

@app.post("/decks/{deck_id}/play_announcement")
def play_announcement(deck_id: str, req: PlayAnnouncementRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].play_announcement(req.filepath, notify=req.notify)
    return {"status": "ok"}


@app.post("/announce/sync")
def play_announcement_sync_group(req: SyncAnnounceRequest):
    """
    Start the same announcement/jingle on multiple decks at the same instant,
    corrected for each deck's calibrated downstream latency (offsets_ms).

    Two-phase release:
      1. Coarse — every target deck primes its decode pipeline and signals
         readiness; we wait (bounded) for all of them.
      2. Fine — once the group is ready, compute one shared anchor instant
         and each deck's own release time = anchor - offsets_ms[deck], so a
         deck with a slower downstream path (longer fiber, slower decoder,
         farther speaker) is released earlier and arrives in sync anyway.

    See MULTIZONE_SYNC_PLAN.md.
    """
    valid_ids = [d for d in req.deck_ids if d in decks]
    if not valid_ids:
        raise HTTPException(status_code=400, detail="No valid deck_ids")

    ready_events   = {did: threading.Event() for did in valid_ids}
    release_event  = threading.Event()
    release_at_map: Dict[str, float] = {}

    for did in valid_ids:
        decks[did].play_announcement(
            req.filepath,
            notify=req.notify,
            ready_event=ready_events[did],
            release_event=release_event,
            release_at_map=release_at_map,
        )

    # Wait for every deck's decode pipeline to produce its first chunk.
    # Bounded — if a file is missing/broken on one deck, don't hold the
    # rest of the group hostage past this deadline.
    deadline = time.monotonic() + 2.0
    for ev in ready_events.values():
        remaining = max(0.0, deadline - time.monotonic())
        ev.wait(timeout=remaining)

    # Fine-grained per-deck release: small safety margin gives every thread
    # time to wake from release_event and read its own target before anchor
    # passes.
    anchor = time.monotonic() + 0.05
    for did in valid_ids:
        release_at_map[did] = anchor - (req.offsets_ms.get(did, 0) / 1000.0)

    release_event.set()
    print(f"[sync] Released announcement group on decks {valid_ids}: {os.path.basename(req.filepath)}")
    return {"status": "ok", "decks": valid_ids, "synced": True}


@app.post("/play/sync")
def play_sync_group(req: SyncPlayRequest):
    """
    Start plain track playback on multiple decks at the same calibrated
    instant — same mechanism as /announce/sync, applied to ordinary deck
    playback (Playlist Broadcast, Sync-All). See MULTIZONE_SYNC_PLAN.md.
    """
    valid_ids = [d for d in req.deck_ids if d in decks]
    if not valid_ids:
        raise HTTPException(status_code=400, detail="No valid deck_ids")

    ready_events   = {did: threading.Event() for did in valid_ids}
    release_event  = threading.Event()
    release_at_map: Dict[str, float] = {}

    for did in valid_ids:
        decks[did].play(
            req.filepath,
            loop=req.loop,
            seek_seconds=req.seek_seconds.get(did, 0.0),
            ready_event=ready_events[did],
            release_event=release_event,
            release_at_map=release_at_map,
        )

    deadline = time.monotonic() + 2.0
    for ev in ready_events.values():
        remaining = max(0.0, deadline - time.monotonic())
        ev.wait(timeout=remaining)

    anchor = time.monotonic() + 0.05
    for did in valid_ids:
        release_at_map[did] = anchor - (req.offsets_ms.get(did, 0) / 1000.0)

    release_event.set()
    print(f"[sync] Released play group on decks {valid_ids}: {os.path.basename(req.filepath)}")
    return {"status": "ok", "decks": valid_ids, "synced": True}

@app.post("/decks/{deck_id}/crossfade")
def crossfade_track(deck_id: str, req: CrossfadeRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].crossfade_to(req.filepath, loop=req.loop, duration=req.duration)
    return {
        "status": "ok",
        "deck": deck_id,
        "filepath": req.filepath,
        "duration": req.duration,
        "loop": req.loop,
    }


# ── Mic endpoints ─────────────────────────────────────────────
@app.post("/mic/stream/start")
def mic_stream_start(req: MicStreamStartRequest):
    raw_targets = req.targets
    target_ids  = ["a","b","c","d","e","f"] if (not raw_targets or "ALL" in raw_targets) else [t.lower() for t in raw_targets]
    session_id  = str(uuid.uuid4())[:8]
    duck_vol    = max(0, min(100, req.ducking))

    for deck_id in target_ids:
        if deck_id in decks:
            decks[deck_id].set_ducking(duck_vol)

    cmd = [
        "ffmpeg", "-y",
        "-f", "s16le", "-ar", "44100", "-ac", "1", "-i", "pipe:0",
        "-f", "s16le", "-ar", "44100", "-ac", "2", "pipe:1",
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    mic_sessions[session_id] = {"proc": proc, "targets": target_ids, "duck_vol": duck_vol}

    def _mic_reader():
        try:
            while proc and proc.poll() is None:
                chunk = proc.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                if len(chunk) < CHUNK_SIZE:
                    chunk += b'\x00' * (CHUNK_SIZE - len(chunk))
                for did in target_ids:
                    if did in decks:
                        try:
                            decks[did].mic_q.put(chunk, timeout=0.1)
                        except queue.Full:
                            pass
        except Exception:
            pass

    threading.Thread(target=_mic_reader, daemon=True).start()
    return {"status": "ok", "session_id": session_id, "targets": target_ids}

@app.post("/mic/stream/push")
async def mic_stream_push(request: Request):
    session_id = request.headers.get("X-Session-Id", "")
    session    = mic_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    data = await request.body()
    if data:
        proc = session["proc"]
        try:
            if proc.stdin and proc.poll() is None:
                proc.stdin.write(data)
                proc.stdin.flush()
        except BrokenPipeError:
            pass
    return {"status": "ok"}

@app.post("/mic/stream/stop")
def mic_stream_stop(req: MicStreamStopRequest):
    session = mic_sessions.pop(req.session_id, None)
    if session:
        proc = session.get("proc")
        if proc:
            try:
                if proc.stdin: proc.stdin.close()
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                pass
        for deck_id in session.get("targets", []):
            if deck_id in decks:
                decks[deck_id].set_ducking(100)
    return {"status": "ok"}

@app.post("/mic/off")
def mic_off():
    for k in list(mic_sessions.keys()):
        mic_stream_stop(MicStreamStopRequest(session_id=k))
    return {"status": "ok"}


# ── Request models for DJ ─────────────────────────────────────
class RecordStartRequest(BaseModel):
    filename: str

class EffectRequest(BaseModel):
    effect: str


# ── DJ endpoints ──────────────────────────────────────────────
@app.post("/dj/{deck_id}/switch_to_dj")
def switch_to_dj(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    rtmp_url = f"rtmp://{MEDIAMTX_HOST}:1935/dj-{deck_id}"
    decks[deck_id].play(rtmp_url, loop=False)
    return {"status": "ok", "deck": deck_id, "source": rtmp_url}

@app.post("/dj/{deck_id}/switch_to_playlist")
def switch_to_playlist(deck_id: str, req: PlayRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].play(req.filepath, loop=req.loop, seek_seconds=req.seek_seconds)
    return {"status": "ok", "deck": deck_id, "filepath": req.filepath}

@app.post("/dj/{deck_id}/fade_out")
def dj_fade_out(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].fade_volume(0, 3.0)
    return {"status": "ok", "deck": deck_id}

@app.post("/dj/{deck_id}/fade_in")
def dj_fade_in(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].fade_volume(100, 3.0)
    return {"status": "ok", "deck": deck_id}

@app.post("/dj/{deck_id}/duck")
def dj_duck(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].set_volume(20)
    return {"status": "ok", "deck": deck_id}

@app.post("/dj/{deck_id}/unduck")
def dj_unduck(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].set_volume(100)
    return {"status": "ok", "deck": deck_id}

@app.post("/dj/{deck_id}/record_start")
def dj_record_start(deck_id: str, req: RecordStartRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].record_start(req.filename)
    return {"status": "ok", "deck": deck_id, "filename": req.filename}

@app.post("/dj/{deck_id}/record_stop")
def dj_record_stop(deck_id: str):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].record_stop()
    return {"status": "ok", "deck": deck_id}

@app.post("/dj/{deck_id}/effect")
def dj_effect(deck_id: str, req: EffectRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].set_effect(req.effect)
    return {"status": "ok", "deck": deck_id, "effect": req.effect}


# ── Health ────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "decks": {
            name: {
                "playing":  d.is_playing,
                "loop":     d.is_loop,
                "track":    d.current_track,
                "volume":   d.volume,
                "duck":     d.duck_volume,
                "elapsed":  round(d.elapsed_seconds, 2),
            }
            for name, d in decks.items()
        },
        "mic_sessions": list(mic_sessions.keys()),
    }


# ── Debug endpoints ───────────────────────────────────────────
@app.get("/debug/chimes")
def debug_chimes():
    try:
        files = sorted(os.listdir("/chimes"))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"path": "/chimes", "files": files, "count": len(files)}

@app.get("/debug/announcements")
def debug_announcements():
    try:
        files = sorted(os.listdir("/announcements"))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"path": "/announcements", "files": files, "count": len(files)}

@app.get("/debug/library")
def debug_library():
    try:
        files = sorted(os.listdir("/library"))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"path": "/library", "files": files, "count": len(files)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
