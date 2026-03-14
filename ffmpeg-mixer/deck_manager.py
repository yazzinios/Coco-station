import os
import subprocess
import threading
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
import uvicorn
from pydantic import BaseModel
from typing import Optional

MEDIAMTX_HOST = os.getenv("MEDIAMTX_HOST", "mediamtx")
RTMP_BASE_URL = f"rtmp://{MEDIAMTX_HOST}:1935"
LIBRARY_DIR = "/library"
ANNOUNCEMENTS_DIR = "/announcements"


class Deck:
    def __init__(self, name):
        self.name = name
        self.lock = threading.Lock()
        self.volume = 100
        self.is_playing = False
        self.current_track = None

        # Main stream process — silence loop → RTMP (always running)
        self.stream_proc = None
        # Overlay process — plays a track/announcement over the stream
        self.play_proc = None
        self.play_thread = None

    def start_stream(self):
        """Start a continuous silent RTMP stream for this deck."""
        if self.stream_proc and self.stream_proc.poll() is None:
            return
        rtmp_url = f"{RTMP_BASE_URL}/deck-{self.name}"
        # Stream silence so MediaMTX has a continuous feed
        cmd = [
            "ffmpeg", "-re", "-y",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-c:a", "aac", "-b:a", "128k",
            "-f", "flv", rtmp_url
        ]
        self.stream_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"Deck {self.name} started streaming to {rtmp_url}")

    def _play_file_thread(self, filepath, volume, rtmp_url):
        """Background thread: decode audio file and push to RTMP."""
        # Stop silence stream first
        if self.stream_proc and self.stream_proc.poll() is None:
            self.stream_proc.terminate()
            self.stream_proc.wait()
            self.stream_proc = None

        vol_filter = f"volume={volume / 100:.2f}"
        cmd = [
            "ffmpeg", "-re", "-y",
            "-i", filepath,
            "-af", vol_filter,
            "-c:a", "aac", "-b:a", "128k",
            "-f", "flv", rtmp_url
        ]
        print(f"Deck {self.name} playing: {filepath} → {rtmp_url}")
        self.play_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        _, stderr = self.play_proc.communicate()
        if self.play_proc.returncode != 0 and stderr:
            print(f"Deck {self.name} ffmpeg error: {stderr[-500:].decode(errors='replace')}")
        # After track finishes, restart silence stream
        with self.lock:
            self.is_playing = False
            self.current_track = None
        self.start_stream()

    def play(self, filepath):
        with self.lock:
            # Kill existing play
            if self.play_proc and self.play_proc.poll() is None:
                self.play_proc.terminate()
                self.play_proc.wait()
            self.is_playing = True
            self.current_track = filepath
        rtmp_url = f"{RTMP_BASE_URL}/deck-{self.name}"
        self.play_thread = threading.Thread(
            target=self._play_file_thread,
            args=(filepath, self.volume, rtmp_url),
            daemon=True
        )
        self.play_thread.start()

    def pause(self):
        import signal as _signal
        with self.lock:
            if self.play_proc and self.play_proc.poll() is None:
                try:
                    self.play_proc.send_signal(_signal.SIGSTOP)
                except Exception as e:
                    print(f"Deck {self.name} pause error: {e}")
            self.is_playing = False

    def resume(self):
        import signal as _signal
        with self.lock:
            if self.play_proc and self.play_proc.poll() is None:
                try:
                    self.play_proc.send_signal(_signal.SIGCONT)
                except Exception as e:
                    print(f"Deck {self.name} resume error: {e}")
            self.is_playing = True

    def stop(self):
        with self.lock:
            if self.play_proc and self.play_proc.poll() is None:
                self.play_proc.terminate()
                self.play_proc.wait()
            self.play_proc = None
            self.is_playing = False
            self.current_track = None
        self.start_stream()

    def set_volume(self, vol):
        self.volume = max(0, min(100, vol))
        # Volume is applied on next play; for live adjustment restart the stream
        if self.is_playing and self.current_track:
            self.play(self.current_track)

    def play_announcement(self, filepath):
        """Play an announcement file non-destructively over current state."""
        def _ann_thread():
            saved_track = self.current_track
            saved_playing = self.is_playing
            # Pause current playback
            if self.play_proc and self.play_proc.poll() is None:
                self.play_proc.send_signal(__import__('signal').SIGSTOP)
            # Play announcement
            rtmp_url = f"{RTMP_BASE_URL}/deck-{self.name}"
            cmd = [
                "ffmpeg", "-re", "-y",
                "-i", filepath,
                "-c:a", "aac", "-b:a", "128k",
                "-f", "flv", rtmp_url
            ]
            ann_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            ann_proc.wait()
            # Resume previous playback
            if saved_playing and self.play_proc and self.play_proc.poll() is None:
                self.play_proc.send_signal(__import__('signal').SIGCONT)
            elif not saved_playing:
                self.start_stream()
        t = threading.Thread(target=_ann_thread, daemon=True)
        t.start()


decks = {name: Deck(name) for name in ["a", "b", "c", "d"]}

# Active mic processes keyed by deck_id (legacy ALSA mic)
mic_procs: dict = {}
MIC_INPUT_DEVICE = os.getenv("MIC_DEVICE", "default")

# Browser mic streaming sessions: session_id -> {procs, queues, tasks}
mic_sessions: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    for deck in decks.values():
        deck.start_stream()
    yield
    for deck in decks.values():
        deck.stop()


app = FastAPI(lifespan=lifespan)


class PlayRequest(BaseModel):
    filepath: str

class MicRequest(BaseModel):
    targets: list

class MicStreamStartRequest(BaseModel):
    targets: list
    ducking: int = 20  # volume % music drops to during mic (0-100)

class MicStreamStopRequest(BaseModel):
    session_id: str


@app.post("/decks/{deck_id}/play")
def play_track(deck_id: str, req: PlayRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].play(req.filepath)
    return {"status": "ok", "deck": deck_id, "filepath": req.filepath}


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


@app.post("/decks/{deck_id}/volume/{level}")
def set_volume(deck_id: str, level: int):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].set_volume(level)
    return {"status": "ok", "volume": decks[deck_id].volume}


@app.post("/decks/{deck_id}/play_announcement")
def play_announcement(deck_id: str, req: PlayRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].play_announcement(req.filepath)
    return {"status": "ok"}


@app.post("/mic/on")
def mic_on(req: MicRequest):
    """Legacy ALSA mic on (server-side mic device)."""
    global mic_procs
    for proc in list(mic_procs.values()):
        if proc and proc.poll() is None:
            proc.terminate(); proc.wait()
    mic_procs.clear()
    targets = req.targets if req.targets else ["a", "b", "c", "d"]
    for deck_id in targets:
        rtmp_url = f"{RTMP_BASE_URL}/deck-{deck_id}"
        cmd = ["ffmpeg", "-re", "-y", "-f", "alsa", "-i", MIC_INPUT_DEVICE,
               "-c:a", "aac", "-b:a", "128k", "-f", "flv", rtmp_url]
        try:
            mic_procs[deck_id] = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            print(f"Mic proc failed for deck {deck_id}: {e}")
    return {"status": "ok", "targets": targets}


@app.post("/mic/off")
def mic_off():
    """Stop ALSA mic and any streaming sessions."""
    global mic_procs
    for proc in list(mic_procs.values()):
        if proc and proc.poll() is None:
            proc.terminate(); proc.wait()
    mic_procs.clear()
    # Also stop all streaming sessions
    for sid in list(mic_sessions.keys()):
        _stop_mic_session(sid)
    return {"status": "ok"}


# ────────────────────────────────────────────────────────────────────────────────
# BROWSER MIC STREAMING — raw PCM from browser, piped into ffmpeg → RTMP
# ────────────────────────────────────────────────────────────────────────────────

def _stop_mic_session(session_id: str):
    """Terminate all ffmpeg procs for a mic session, restart silence streams."""
    session = mic_sessions.pop(session_id, None)
    if not session:
        return
    for deck_id, proc in session.get("procs", {}).items():
        try:
            if proc.stdin:
                proc.stdin.close()
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=2)
        except Exception:
            pass
        # Restart silence stream so MediaMTX path stays alive
        if deck_id in decks:
            decks[deck_id].start_stream()
    print(f"[mic_session] {session_id} stopped")


@app.post("/mic/stream/start")
def mic_stream_start(req: MicStreamStartRequest):
    """
    Start one ffmpeg process per target deck.
    ffmpeg reads raw s16le PCM from stdin and pushes RTMP to MediaMTX.
    Music on target decks is ducked to req.ducking %.
    Returns a session_id to reference this stream.
    """
    raw_targets = req.targets
    if not raw_targets or "ALL" in raw_targets:
        target_ids = ["a", "b", "c", "d"]
    else:
        target_ids = [t.lower() for t in raw_targets]

    session_id = str(uuid.uuid4())[:8]
    procs = {}

    # Duck music on targeted decks
    duck_vol = max(0, min(100, req.ducking))
    for deck_id in target_ids:
        if deck_id in decks:
            orig_vol = decks[deck_id].volume
            decks[deck_id].set_volume(duck_vol)

    # Stop silence streams for targeted decks (mic ffmpeg will publish instead)
    for deck_id in target_ids:
        if deck_id in decks:
            d = decks[deck_id]
            if d.stream_proc and d.stream_proc.poll() is None:
                d.stream_proc.terminate()
                d.stream_proc.wait()
                d.stream_proc = None

    # Start one ffmpeg per deck reading from stdin pipe
    for deck_id in target_ids:
        rtmp_url = f"{RTMP_BASE_URL}/deck-{deck_id}"
        cmd = [
            "ffmpeg", "-y",
            "-f", "s16le",    # raw signed 16-bit LE PCM
            "-ar", "44100",   # sample rate from browser
            "-ac", "1",       # mono
            "-i", "pipe:0",   # read from stdin
            "-c:a", "aac",
            "-b:a", "128k",
            "-f", "flv", rtmp_url
        ]
        print(f"[mic_session] {session_id} → deck-{deck_id} ({rtmp_url})")
        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            procs[deck_id] = proc
        except Exception as e:
            print(f"[mic_session] ffmpeg start error for deck {deck_id}: {e}")

    mic_sessions[session_id] = {
        "procs": procs,
        "targets": target_ids,
        "duck_vol": duck_vol,
    }
    return {"status": "ok", "session_id": session_id, "targets": target_ids}


@app.post("/mic/stream/push")
async def mic_stream_push(request: Request):
    """
    Receive a raw PCM chunk and write it to all ffmpeg stdin pipes
    for the given session.
    """
    session_id = request.headers.get("X-Session-Id", "")
    session = mic_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    data = await request.body()
    if data:
        for deck_id, proc in session["procs"].items():
            try:
                if proc.stdin and proc.poll() is None:
                    proc.stdin.write(data)
                    proc.stdin.flush()
            except BrokenPipeError:
                pass
    return {"status": "ok"}


@app.post("/mic/stream/stop")
def mic_stream_stop(req: MicStreamStopRequest):
    """Stop a mic streaming session and restore deck volumes."""
    session = mic_sessions.get(req.session_id)
    if session:
        # Restore volumes
        for deck_id in session.get("targets", []):
            if deck_id in decks:
                decks[deck_id].set_volume(decks[deck_id].volume)  # reset to saved
                decks[deck_id].set_volume(100)  # restore to full
    _stop_mic_session(req.session_id)
    return {"status": "ok"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "decks": {name: {"playing": d.is_playing, "track": d.current_track} for name, d in decks.items()},
        "mic_active": bool(mic_procs),
        "mic_targets": list(mic_procs.keys()),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
