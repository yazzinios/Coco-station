import os
import subprocess
import threading
import time
import json
from fastapi import FastAPI, BackgroundTasks, HTTPException
import uvicorn
from pydantic import BaseModel

app = FastAPI()

MEDIAMTX_HOST = os.getenv("MEDIAMTX_HOST", "mediamtx")
RTMP_BASE_URL = f"rtmp://{MEDIAMTX_HOST}:1935"

# Directories for pipes and temporary files
PIPES_DIR = "/tmp/pipes"
os.makedirs(PIPES_DIR, exist_ok=True)

class Deck:
    def __init__(self, name):
        self.name = name  # "a", "b", "c", "d"
        self.process = None
        
        # Audio input pipes
        self.playlist_pipe = os.path.join(PIPES_DIR, f"playlist_{name}.fifo")
        self.mic_pipe = os.path.join(PIPES_DIR, f"mic_{name}.fifo")
        self.jingle_pipe = os.path.join(PIPES_DIR, f"jingle_{name}.fifo")
        
        self._create_pipes()
        self.volume = 100
        self.is_playing = False
        
        self.thread = None

    def _create_pipes(self):
        for pipe in [self.playlist_pipe, self.mic_pipe, self.jingle_pipe]:
            if not os.path.exists(pipe):
                os.mkfifo(pipe)

    def start_ffmpeg(self):
        if self.process and self.process.poll() is None:
            return  # Already running

        rtmp_url = f"{RTMP_BASE_URL}/deck-{self.name}"
        
        # Base FFmpeg command with 3 inputs: playlist, mic, jingle.
        # amix=inputs=3 mixes them together.
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "s16le", "-ar", "44100", "-ac", "2", "-i", self.playlist_pipe,
            "-f", "s16le", "-ar", "44100", "-ac", "2", "-i", self.mic_pipe,
            "-f", "s16le", "-ar", "44100", "-ac", "2", "-i", self.jingle_pipe,
            "-filter_complex", 
            f"[0:a]volume={self.volume/100:.2f}[a0];[1:a]volume=1.0[a1];[2:a]volume=1.0[a2];[a0][a1][a2]amix=inputs=3:duration=highest:dropout_transition=2[a]",
            "-map", "[a]",
            "-c:a", "aac", "-b:a", "128k",
            "-f", "flv", rtmp_url
        ]
        
        self.process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"Deck {self.name} started streaming to {rtmp_url}")

    def stop_ffmpeg(self):
        if self.process:
            self.process.terminate()
            self.process = None
            print(f"Deck {self.name} stopped.")

decks = {
    "a": Deck("a"),
    "b": Deck("b"),
    "c": Deck("c"),
    "d": Deck("d")
}

@app.on_event("startup")
def startup_event():
    # Start FFmpeg for all decks
    for deck in decks.values():
        deck.start_ffmpeg()

class PlayRequest(BaseModel):
    filepath: str

@app.post("/decks/{deck_id}/play")
def play_track(deck_id: str, req: PlayRequest):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    # In a full implementation, this runs in a thread, decoding 'filepath' and 
    # piping raw s16le audio into `decks[deck_id].playlist_pipe`.
    # For now, placeholder for the python pipeline.
    return {"status": "ok", "message": f"Playing {req.filepath} on deck {deck_id}"}

@app.post("/decks/{deck_id}/volume/{level}")
def set_volume(deck_id: str, level: int):
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    level = max(0, min(100, level))
    decks[deck_id].volume = level
    
    # To apply volume without restarting FFmpeg, we'd use FFmpeg's `sendcmd` via ZMQ or a command file.
    # To keep this script simple initially, we just track the state.
    # A full implementation would pipe a command to the filter graph.
    return {"status": "ok", "volume": level}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
