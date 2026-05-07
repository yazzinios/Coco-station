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
from typing import Optional, List

MEDIAMTX_HOST = os.getenv("MEDIAMTX_HOST", "mediamtx")
RTMP_BASE_URL  = f"rtmp://{MEDIAMTX_HOST}:1935"
API_HOST       = os.getenv("API_HOST", "api")
API_URL        = f"http://{API_HOST}:8000"


def _notify_track_ended(deck_name: str):
    """HTTP callback to main API when a track finishes naturally (no explicit stop)."""
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
    """HTTP callback to main API when an announcement finishes naturally."""
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
    """HTTP callback to main API when dead-air is detected on a deck."""
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
CROSSFADE_DURATION = float(os.getenv("CROSSFADE_DURATION", "3.0"))  # seconds
CROSSFADE_CHUNKS   = max(1, round(CROSSFADE_DURATION / CHUNK_DURATION))  # ~129 chunks @ 3 s


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
        self._play_started_at = 0.0  # epoch when current track started (adjusted for seek)

        self.track_q = queue.Queue(maxsize=500)
        self.ann_q   = queue.Queue(maxsize=200)
        self.mic_q   = queue.Queue(maxsize=100)

        # Crossfade state
        # _xfade_q   : PCM chunks for the incoming track during crossfade
        # _xfade_pos : how many chunks have been blended (0 → CROSSFADE_CHUNKS)
        # _xfade_lock: protects the two fields above
        self._xfade_q    = queue.Queue(maxsize=600)
        self._xfade_pos  = 0          # chunks blended so far
        self._xfade_total= 0          # = CROSSFADE_CHUNKS when active, else 0
        self._xfade_lock = threading.Lock()
        self._xfade_proc = None       # ffmpeg process for incoming track

        # Dead-air watchdog
        # Tracks the last time a non-silent chunk was written to the stream.
        # The watchdog thread fires _notify_dead_air if silence exceeds the threshold.
        self._last_audio_at    = time.time()
        self._dead_air_seconds = float(os.getenv("DEAD_AIR_SECONDS", "15"))
        self._dead_air_fired   = False   # prevent repeated callbacks until audio resumes

        self.stream_proc = None
        self._last_track_chunk = b'\x00' * CHUNK_SIZE
        self._start_master_stream()

        self.mixer_thread    = threading.Thread(target=self._mix_loop,    daemon=True)
        self.watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self.mixer_thread.start()
        self.watchdog_thread.start()

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
        """Smooth S-curve: ease-in/ease-out for crossfade (t in [0, 1])."""
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

                # t goes 0 → 1 as the fade progresses
                t        = self._ease(min(xfade_pos / max(xfade_total, 1), 1.0))
                fade_out = 1.0 - t   # outgoing track: 1 → 0
                fade_in  = t         # incoming track: 0 → 1

                try:
                    out_scaled = audioop.mul(track_chunk, SAMPWIDTH, fade_out) if track_chunk != silence else silence
                    in_scaled  = audioop.mul(xfade_chunk, SAMPWIDTH, fade_in)  if xfade_chunk != silence else silence
                    track_chunk = audioop.add(out_scaled, in_scaled, SAMPWIDTH)
                except Exception:
                    pass

                with self._xfade_lock:
                    self._xfade_pos += 1
                    if self._xfade_pos >= xfade_total:
                        # Crossfade complete — promote incoming track
                        self._xfade_total = 0
                        self._xfade_pos   = 0
                        self._promote_xfade_track()
            # ─────────────────────────────────────────────────────────────

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

            try:
                if self.stream_proc and self.stream_proc.stdin:
                    self.stream_proc.stdin.write(mixed)
                    # Update dead-air watchdog: reset timer if this chunk has audio
                    if mixed != silence:
                        self._last_audio_at  = time.time()
                        self._dead_air_fired = False
            except (BrokenPipeError, OSError):
                print(f"[Deck {self.name}] Broken pipe — restarting RTMP stream")
                self._start_master_stream()
                next_tick = time.time()

    def _watchdog_loop(self):
        """
        Runs in a daemon thread.
        Every second, checks whether the deck has been playing silence for
        longer than _dead_air_seconds.  If so, fires _notify_dead_air once
        (won't fire again until audio resumes), so the API can auto-recover.
        """
        CHECK_INTERVAL = 1.0
        while True:
            time.sleep(CHECK_INTERVAL)
            if not self.is_playing:
                # Deck intentionally stopped — reset and don't alert
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
        """
        Called by _mix_loop (inside _xfade_lock already released) once the
        crossfade completes.  Drains the old track_q, swaps in xfade as the
        new track_q, and updates deck state — all under self.lock.
        """
        with self.lock:
            # Kill old track process
            old_proc = self.track_proc
            if old_proc and old_proc.poll() is None:
                try:
                    old_proc.terminate()
                    old_proc.wait(timeout=1)
                except Exception:
                    pass
            self.track_proc = self._xfade_proc
            self._xfade_proc = None

            # Drain leftover old-track chunks
            drained = 0
            while not self.track_q.empty():
                try:
                    self.track_q.get_nowait()
                    drained += 1
                except Exception:
                    break

            # Move buffered xfade chunks into track_q
            moved = 0
            while not self._xfade_q.empty():
                try:
                    chunk = self._xfade_q.get_nowait()
                    self.track_q.put_nowait(chunk)
                    moved += 1
                except Exception:
                    break

            self._last_track_chunk = b'\x00' * CHUNK_SIZE
            print(f"[Deck {self.name}] Crossfade complete — promoted new track "
                  f"(drained {drained} old, moved {moved} new chunks)")

    def _reader_thread(self, proc, q, proc_name):
        """
        proc_name values:
          "track"  — fires track_ended on natural finish
          "ann"    — fires announcement_ended on natural finish (notify=True)
          "jingle" — fires nothing (notify=False)
        """
        try:
            while proc and proc.poll() is None:
                chunk = proc.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                if len(chunk) < CHUNK_SIZE:
                    chunk += b'\x00' * (CHUNK_SIZE - len(chunk))
                try:
                    q.put(chunk, timeout=2)
                except queue.Full:
                    pass
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
                    threading.Thread(
                        target=_notify_announcement_ended, args=(self.name,), daemon=True
                    ).start()
                else:
                    print(f"[Deck {self.name}] Skipping stale announcement_ended (gen {my_generation} != {current_generation})")
            # "jingle" → fires nothing intentionally

    def crossfade_to(self, filepath: str, loop: bool = False,
                      duration: float = CROSSFADE_DURATION):
        """
        Smoothly transition from the currently playing track to *filepath*.

        - Starts decoding the new track immediately into _xfade_q.
        - The _mix_loop blends old → new over *duration* seconds using an
          S-curve, then calls _promote_xfade_track() to complete the swap.
        - If no track is currently playing, falls back to a plain play().
        """
        if not self.is_playing or not self.current_track:
            print(f"[Deck {self.name}] crossfade_to: no active track — plain play")
            self.play(filepath, loop=loop)
            return

        # Cancel any in-progress crossfade first
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

        cmd = [
            "ffmpeg", "-y",
            "-i", filepath,
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1",
        ]
        if loop:
            cmd = ["ffmpeg", "-y", "-stream_loop", "-1",
                   "-i", filepath,
                   "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1"]

        xproc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

        with self.lock:
            self._xfade_proc = xproc

        # Start feeding xfade_q
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

        # Arm the blend — mix_loop picks this up on the next chunk
        with self._xfade_lock:
            self._xfade_pos   = 0
            self._xfade_total = total_chunks

        # Update deck state to reflect incoming track
        with self.lock:
            self.current_track    = filepath
            self.is_loop          = loop
            self._play_started_at = time.time()

        print(f"[Deck {self.name}] Crossfade → {filepath} "
              f"(duration={duration:.1f}s, chunks={total_chunks})")

    def play(self, filepath, loop: bool = False, seek_seconds: float = 0.0):
        self.stop()
        self._stop_requested = False
        with self.lock:
            self.is_playing    = True
            self.is_loop       = loop
            self.current_track = filepath
            self._play_started_at = time.time() - seek_seconds  # adjust epoch so elapsed stays correct

        cmd = ["ffmpeg", "-y"]
        if seek_seconds > 0:
            cmd += ["-ss", str(seek_seconds)]  # seek BEFORE input for fast seek
        if loop:
            cmd += ["-stream_loop", "-1"]
        cmd += [
            "-i", filepath,
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1",
        ]
        self.track_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        threading.Thread(
            target=self._reader_thread,
            args=(self.track_proc, self.track_q, "track"),
            daemon=True,
        ).start()
        print(f"[Deck {self.name}] Playing: {filepath} (loop={loop}, seek={seek_seconds:.1f}s)")

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
            while not self.track_q.empty():
                try: self.track_q.get_nowait()
                except: pass

    def set_volume(self, vol):
        with self.lock:
            self.volume = max(0, min(100, vol))

    def set_ducking(self, vol):
        with self.lock:
            self.duck_volume = max(0, min(100, vol))

    def cancel_xfade(self):
        """
        Abort any in-progress crossfade immediately.
        Safe to call from any thread.  The outgoing track keeps playing
        uninterrupted; the incoming track's ffmpeg process is killed.
        """
        with self._xfade_lock:
            if self._xfade_total == 0:
                return   # nothing active
            self._xfade_total = 0
            self._xfade_pos   = 0

        # Kill the incoming decoder outside the lock (terminate can block briefly)
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

        # Drain buffered incoming chunks so they don't leak into the next xfade
        while not self._xfade_q.empty():
            try: self._xfade_q.get_nowait()
            except: pass

        print(f"[Deck {self.name}] Crossfade cancelled — outgoing track continues")

    def play_announcement(self, filepath, notify: bool = True):
        """Play a jingle or announcement over the deck audio."""
        # Cancel any crossfade before playing the announcement.
        # Without this, the xfade blend runs for up to 3s on top of the jingle,
        # producing corrupted audio at the start of the announcement sequence.
        self.cancel_xfade()

        with self.lock:
            # Stop previous ann_proc
            if self.ann_proc and self.ann_proc.poll() is None:
                try:
                    self.ann_proc.terminate()
                    self.ann_proc.wait(timeout=2)
                except Exception:
                    pass
            self.ann_proc = None

            # Drain stale audio
            drained = 0
            while not self.ann_q.empty():
                try:
                    self.ann_q.get_nowait()
                    drained += 1
                except Exception:
                    break
            if drained:
                print(f"[Deck {self.name}] Drained {drained} stale ann_q chunks")

            # Advance generation counter
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
            args=(proc, self.ann_q, proc_name),
            daemon=True,
        ).start()
        threading.Thread(
            target=_ann_stderr_logger,
            args=(proc, self.name, filepath),
            daemon=True,
        ).start()

        print(f"[Deck {self.name}] Announcement/Jingle started: {filepath} (notify={notify}, gen={current_gen})")


# ── Initialise decks ─────────────────────────────────────────
decks: dict = {name: Deck(name) for name in ["a", "b", "c", "d", "e"]}
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
    seek_seconds: float = 0.0  # start playback at this offset (for deck sync/clone)

class PlayAnnouncementRequest(BaseModel):
    filepath: str
    notify: bool = True

class CrossfadeRequest(BaseModel):
    filepath: str
    loop: bool = False
    duration: float = CROSSFADE_DURATION  # override per-request if needed

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
    """Return elapsed playback seconds for the current track.
    Used by the clone/sync feature to seek a second deck to the same position.
    """
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    d = decks[deck_id]
    if not d.is_playing or not d.current_track:
        return {"deck": deck_id, "elapsed": 0.0, "is_playing": False}
    elapsed = max(0.0, time.time() - d._play_started_at)
    return {"deck": deck_id, "elapsed": round(elapsed, 2), "is_playing": True, "track": d.current_track}

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

@app.post("/decks/{deck_id}/crossfade")
def crossfade_track(deck_id: str, req: CrossfadeRequest):
    """Crossfade from the current track to a new one over req.duration seconds."""
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
    target_ids  = ["a","b","c","d","e"] if (not raw_targets or "ALL" in raw_targets) else [t.lower() for t in raw_targets]
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


# ── Health ────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "decks": {
            name: {
                "playing": d.is_playing,
                "loop":    d.is_loop,
                "track":   d.current_track,
                "volume":  d.volume,
                "duck":    d.duck_volume,
            }
            for name, d in decks.items()
        },
        "mic_sessions": list(mic_sessions.keys()),
    }


# ── Debug endpoints — verify what the mixer container can see ─
@app.get("/debug/chimes")
def debug_chimes():
    """List all files visible at /chimes/ inside the mixer container."""
    try:
        files = sorted(os.listdir("/chimes"))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"path": "/chimes", "files": files, "count": len(files)}

@app.get("/debug/announcements")
def debug_announcements():
    """List all files visible at /announcements/ inside the mixer container."""
    try:
        files = sorted(os.listdir("/announcements"))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"path": "/announcements", "files": files, "count": len(files)}

@app.get("/debug/library")
def debug_library():
    """List all files visible at /library/ inside the mixer container."""
    try:
        files = sorted(os.listdir("/library"))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"path": "/library", "files": files, "count": len(files)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
