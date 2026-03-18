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

# Base ffmpeg output args — audio only AAC, no video track
FFMPEG_OUT = ["-vn", "-c:a", "aac", "-b:a", "128k", "-f", "flv"]


class Deck:
    def __init__(self, name):
        self.name = name
        self.lock = threading.Lock()
        self.volume = 100
        self.is_playing = False
        self.current_track = None
        self.stream_proc = None
        self.play_proc = None
        self.play_thread = None

    def start_stream(self):
        """Start a continuous silent RTMP stream for this deck."""
        if self.stream_proc and self.stream_proc.poll() is None:
            return
        rtmp_url = f"{RTMP_BASE_URL}/deck-{self.name}"
        cmd = [
            "ffmpeg", "-re", "-y",
            "-fflags", "nobuffer", "-flags", "low_delay",
            "-probesize", "32", "-analyzeduration", "0",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        ] + FFMPEG_OUT + [rtmp_url]
        self.stream_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"Deck {self.name} started streaming to {rtmp_url}")

    def _play_file_thread(self, filepath, volume, rtmp_url):
        """Background thread: decode audio file and push to RTMP."""
        if self.stream_proc and self.stream_proc.poll() is None:
            self.stream_proc.terminate()
            self.stream_proc.wait()
            self.stream_proc = None

        vol_filter = f"volume={volume / 100:.2f}"
        cmd = [
            "ffmpeg", "-re", "-y",
            "-fflags", "nobuffer", "-flags", "low_delay",
            "-probesize", "32", "-analyzeduration", "0",
            "-i", filepath,
            "-af", vol_filter,
        ] + FFMPEG_OUT + [rtmp_url]

        print(f"Deck {self.name} playing: {filepath} → {rtmp_url}")
        self.play_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        _, stderr = self.play_proc.communicate()
        if self.play_proc.returncode != 0 and stderr:
            print(f"Deck {self.name} ffmpeg error: {stderr[-500:].decode(errors='replace')}")

        with self.lock:
            self.is_playing = False
            self.current_track = None
        self.start_stream()

    def play(self, filepath):
        with self.lock:
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
        if self.is_playing and self.current_track:
            self.play(self.current_track)

    def play_announcement(self, filepath):
        """Play an announcement non-destructively over current state."""
        def _ann_thread():
            saved_playing = self.is_playing
            if self.play_proc and self.play_proc.poll() is None:
                self.play_proc.send_signal(__import__('signal').SIGSTOP)
            rtmp_url = f"{RTMP_BASE_URL}/deck-{self.name}"
            cmd = [
                "ffmpeg", "-re", "-y",
                "-fflags", "nobuffer", "-flags", "low_delay",
                "-probesize", "32", "-analyzeduration", "0",
                "-i", filepath
            ] + FFMPEG_OUT + [rtmp_url]
            ann_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            ann_proc.wait()
            if saved_playing and self.play_proc and self.play_proc.poll() is None:
                self.play_proc.send_signal(__import__('signal').SIGCONT)
            elif not saved_playing:
                self.start_stream()
        threading.Thread(target=_ann_thread, daemon=True).start()


decks = {name: Deck(name) for name in ["a", "b", "c", "d"]}
mic_procs: dict = {}
mic_sessions: dict = {}
MIC_INPUT_DEVICE = os.getenv("MIC_DEVICE", "default")


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
    ducking: int = 20

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
    global mic_procs
    for proc in list(mic_procs.values()):
        if proc and proc.poll() is None:
            proc.terminate(); proc.wait()
    mic_procs.clear()
    targets = req.targets if req.targets else ["a", "b", "c", "d"]
    for deck_id in targets:
        rtmp_url = f"{RTMP_BASE_URL}/deck-{deck_id}"
        cmd = ["ffmpeg", "-re", "-y", "-f", "alsa", "-i", MIC_INPUT_DEVICE,
               "-vn", "-c:a", "aac", "-b:a", "128k", "-f", "flv", rtmp_url]
        try:
            mic_procs[deck_id] = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            print(f"Mic proc failed for deck {deck_id}: {e}")
    return {"status": "ok", "targets": targets}

@app.post("/mic/off")
def mic_off():
    global mic_procs
    for proc in list(mic_procs.values()):
        if proc and proc.poll() is None:
            proc.terminate(); proc.wait()
    mic_procs.clear()
    for sid in list(mic_sessions.keys()):
        _stop_mic_session(sid)
    return {"status": "ok"}

def _stop_mic_session(session_id: str):
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
        if deck_id in decks:
            decks[deck_id].start_stream()
    print(f"[mic_session] {session_id} stopped")

@app.post("/mic/stream/start")
def mic_stream_start(req: MicStreamStartRequest):
    raw_targets = req.targets
    if not raw_targets or "ALL" in raw_targets:
        target_ids = ["a", "b", "c", "d"]
    else:
        target_ids = [t.lower() for t in raw_targets]

    session_id = str(uuid.uuid4())[:8]
    procs = {}
    duck_vol = max(0, min(100, req.ducking))

    for deck_id in target_ids:
        if deck_id in decks:
            decks[deck_id].set_volume(duck_vol)

    for deck_id in target_ids:
        if deck_id in decks:
            d = decks[deck_id]
            if d.stream_proc and d.stream_proc.poll() is None:
                d.stream_proc.terminate()
                d.stream_proc.wait()
                d.stream_proc = None

    for deck_id in target_ids:
        rtmp_url = f"{RTMP_BASE_URL}/deck-{deck_id}"
        cmd = [
            "ffmpeg", "-y",
            "-f", "s16le", "-ar", "44100", "-ac", "1", "-i", "pipe:0",
            "-vn", "-c:a", "aac", "-b:a", "128k", "-f", "flv", rtmp_url
        ]
        print(f"[mic_session] {session_id} → deck-{deck_id} ({rtmp_url})")
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            procs[deck_id] = proc
        except Exception as e:
            print(f"[mic_session] ffmpeg start error for deck {deck_id}: {e}")

    mic_sessions[session_id] = {"procs": procs, "targets": target_ids, "duck_vol": duck_vol}
    return {"status": "ok", "session_id": session_id, "targets": target_ids}

@app.post("/mic/stream/push")
async def mic_stream_push(request: Request):
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
    session = mic_sessions.get(req.session_id)
    if session:
        for deck_id in session.get("targets", []):
            if deck_id in decks:
                decks[deck_id].set_volume(100)
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
