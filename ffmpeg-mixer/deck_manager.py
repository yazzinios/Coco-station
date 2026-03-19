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
from typing import Optional

MEDIAMTX_HOST = os.getenv("MEDIAMTX_HOST", "mediamtx")
RTMP_BASE_URL = f"rtmp://{MEDIAMTX_HOST}:1935"

CHUNK_SIZE = 4096
SAMPLE_RATE = 44100
CHANNELS = 2
SAMPWIDTH = 2 # 16-bit
# Seconds of audio per chunk — used to pace the mix_loop in real-time
CHUNK_DURATION = CHUNK_SIZE / (SAMPLE_RATE * CHANNELS * SAMPWIDTH)  # ~0.0232 s

class Deck:
    def __init__(self, name):
        self.name = name
        self.lock = threading.Lock()
        self.volume = 100
        self.duck_volume = 100
        self.is_playing = False
        self.current_track = None
        
        self.track_proc = None
        self.ann_proc = None
        
        self.track_q = queue.Queue(maxsize=100)
        self.ann_q = queue.Queue(maxsize=100)
        self.mic_q = queue.Queue(maxsize=100)
        
        self.stream_proc = None
        self._start_master_stream()
        
        self.mixer_thread = threading.Thread(target=self._mix_loop, daemon=True)
        self.mixer_thread.start()

    def _start_master_stream(self):
        rtmp_url = f"{RTMP_BASE_URL}/deck-{self.name}"
        # Start a continuous ffmpeg stream reading from stdin. 
        # By removing -re and relying on stdin pipe blocking, we achieve perfect streaming stability.
        cmd = [
            "ffmpeg", "-y",
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "-i", "pipe:0",
            "-c:a", "aac", "-b:a", "128k", "-f", "flv", rtmp_url
        ]
        self.stream_proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"Deck {self.name} master stream started: {rtmp_url}")

    def _mix_loop(self):
        silence = b'\x00' * CHUNK_SIZE
        next_tick = time.time()
        while True:
            # Real-time pacing: sleep until the next tick so we emit exactly one
            # chunk per CHUNK_DURATION seconds. This keeps the RTMP stream stable
            # and prevents the ffmpeg stdin pipe from being flooded when idle.
            now = time.time()
            sleep_for = next_tick - now
            if sleep_for > 0:
                time.sleep(sleep_for)
            next_tick += CHUNK_DURATION

            # Get track audio (block briefly so we don't busy-spin when playing)
            track_chunk = silence
            try: track_chunk = self.track_q.get(timeout=CHUNK_DURATION * 0.5)
            except queue.Empty: pass

            # Get announcement audio
            ann_chunk = silence
            try: ann_chunk = self.ann_q.get_nowait()
            except queue.Empty: pass

            # Get mic audio
            mic_chunk = silence
            mic_active = False
            try:
                mic_chunk = self.mic_q.get_nowait()
                mic_active = True
            except queue.Empty: pass

            # Volume + ducking
            vol_factor = self.volume / 100.0
            if mic_active:
                vol_factor *= (self.duck_volume / 100.0)
            if vol_factor != 1.0 and track_chunk != silence:
                try: track_chunk = audioop.mul(track_chunk, SAMPWIDTH, vol_factor)
                except Exception: pass

            # Mix all three sources
            mixed = silence
            try:
                mixed = audioop.add(track_chunk, ann_chunk, SAMPWIDTH)
                mixed = audioop.add(mixed, mic_chunk, SAMPWIDTH)
            except Exception:
                pass

            # Write to RTMP encoder
            try:
                if self.stream_proc and self.stream_proc.stdin:
                    self.stream_proc.stdin.write(mixed)
                    self.stream_proc.stdin.flush()
            except (BrokenPipeError, OSError):
                print(f"Deck {self.name} connection broken, restarting master RTMP stream")
                self._start_master_stream()
                next_tick = time.time()

    def _reader_thread(self, proc, q, proc_name):
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
                with self.lock:
                    self.is_playing = False
                    self.current_track = None

    def play(self, filepath):
        self.stop()
        with self.lock:
            self.is_playing = True
            self.current_track = filepath
        cmd = [
            "ffmpeg", "-y", "-i", filepath,
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1"
        ]
        self.track_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        threading.Thread(target=self._reader_thread, args=(self.track_proc, self.track_q, "track"), daemon=True).start()
        print(f"Deck {self.name} playing: {filepath}")

    def pause(self):
        with self.lock:
            if self.track_proc and self.track_proc.poll() is None:
                try: self.track_proc.send_signal(signal.SIGSTOP)
                except Exception: pass
            self.is_playing = False

    def resume(self):
        with self.lock:
            if self.track_proc and self.track_proc.poll() is None:
                try: self.track_proc.send_signal(signal.SIGCONT)
                except Exception: pass
            self.is_playing = True

    def stop(self):
        with self.lock:
            if self.track_proc and self.track_proc.poll() is None:
                try: 
                    self.track_proc.terminate()
                    self.track_proc.wait(timeout=2)
                except Exception: pass
            self.track_proc = None
            self.is_playing = False
            self.current_track = None
            # Empty track queue
            while not self.track_q.empty():
                try: self.track_q.get_nowait()
                except: pass

    def set_volume(self, vol):
        with self.lock:
            self.volume = max(0, min(100, vol))

    def set_ducking(self, vol):
        with self.lock:
            self.duck_volume = max(0, min(100, vol))

    def play_announcement(self, filepath):
        if self.ann_proc and self.ann_proc.poll() is None:
            try:
                self.ann_proc.terminate()
                self.ann_proc.wait(timeout=2)
            except Exception: pass
        # Empty old announcement queue
        while not self.ann_q.empty():
            try: self.ann_q.get_nowait()
            except: pass
        
        cmd = [
            "ffmpeg", "-y", "-i", filepath,
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "pipe:1"
        ]
        self.ann_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        threading.Thread(target=self._reader_thread, args=(self.ann_proc, self.ann_q, "ann"), daemon=True).start()
        print(f"Deck {self.name} playing announcement: {filepath}")


decks = {name: Deck(name) for name in ["a", "b", "c", "d"]}
mic_sessions: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for deck in decks.values():
        deck.stop()
        if deck.stream_proc and deck.stream_proc.poll() is None:
            deck.stream_proc.terminate()

app = FastAPI(lifespan=lifespan)

class PlayRequest(BaseModel):
    filepath: str

class MicStreamStartRequest(BaseModel):
    targets: list
    ducking: int = 20

class MicStreamStopRequest(BaseModel):
    session_id: str


@app.post("/decks/{deck_id}/play")
def play_track(deck_id: str, req: PlayRequest):
    if deck_id not in decks: raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].play(req.filepath)
    return {"status": "ok", "deck": deck_id, "filepath": req.filepath}

@app.post("/decks/{deck_id}/pause")
def pause_track(deck_id: str):
    if deck_id not in decks: raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].pause()
    return {"status": "ok", "deck": deck_id}

@app.post("/decks/{deck_id}/resume")
def resume_track(deck_id: str):
    if deck_id not in decks: raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].resume()
    return {"status": "ok", "deck": deck_id}

@app.post("/decks/{deck_id}/stop")
def stop_track(deck_id: str):
    if deck_id not in decks: raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].stop()
    return {"status": "ok"}

@app.post("/decks/{deck_id}/volume/{level}")
def set_volume(deck_id: str, level: int):
    if deck_id not in decks: raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].set_volume(level)
    return {"status": "ok", "volume": level}

@app.post("/decks/{deck_id}/play_announcement")
def play_announcement(deck_id: str, req: PlayRequest):
    if deck_id not in decks: raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id].play_announcement(req.filepath)
    return {"status": "ok"}

@app.post("/mic/stream/start")
def mic_stream_start(req: MicStreamStartRequest):
    raw_targets = req.targets
    target_ids = ["a", "b", "c", "d"] if not raw_targets or "ALL" in raw_targets else [t.lower() for t in raw_targets]

    session_id = str(uuid.uuid4())[:8]
    duck_vol = max(0, min(100, req.ducking))

    for deck_id in target_ids:
        if deck_id in decks:
            decks[deck_id].set_ducking(duck_vol)

    # Proc to convert mono PCM to stereo PCM for mixing
    cmd = [
        "ffmpeg", "-y",
        "-f", "s16le", "-ar", "44100", "-ac", "1", "-i", "pipe:0",
        "-f", "s16le", "-ar", "44100", "-ac", "2", "pipe:1"
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    
    mic_sessions[session_id] = {"proc": proc, "targets": target_ids, "duck_vol": duck_vol}

    def _mic_reader():
        try:
            while proc and proc.poll() is None:
                chunk = proc.stdout.read(CHUNK_SIZE)
                if not chunk: break
                if len(chunk) < CHUNK_SIZE:
                    chunk += b'\x00' * (CHUNK_SIZE - len(chunk))
                for did in target_ids:
                    if did in decks:
                        try: decks[did].mic_q.put(chunk, timeout=0.1)
                        except queue.Full: pass
        except Exception: pass

    threading.Thread(target=_mic_reader, daemon=True).start()
    return {"status": "ok", "session_id": session_id, "targets": target_ids}

@app.post("/mic/stream/push")
async def mic_stream_push(request: Request):
    session_id = request.headers.get("X-Session-Id", "")
    session = mic_sessions.get(session_id)
    if not session: raise HTTPException(status_code=404, detail="Session not found")
    data = await request.body()
    if data:
        proc = session["proc"]
        try:
            if proc.stdin and proc.poll() is None:
                proc.stdin.write(data)
                # Important: flush isn't strictly necessary for pipe, but helpful
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
            except Exception: pass
        for deck_id in session.get("targets", []):
            if deck_id in decks:
                decks[deck_id].set_ducking(100)
    return {"status": "ok"}

@app.post("/mic/off") # Fallback cleanup
def mic_off():
    keys = list(mic_sessions.keys())
    for k in keys:
        mic_stream_stop(MicStreamStopRequest(session_id=k))
    return {"status": "ok"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "decks": {name: {"playing": d.is_playing, "track": d.current_track, "volume": d.volume, "duck": d.duck_volume} for name, d in decks.items()},
        "mic_sessions": list(mic_sessions.keys())
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
