"""
fix_mixer_debug.py
==================
Add these two debug endpoints to deck_manager.py so you can verify
what the mixer container sees on its filesystem without docker exec.

INSTRUCTIONS
------------
Copy the two route functions below into deck_manager.py,
just before the  if __name__ == "__main__":  line at the bottom.

Then rebuild the ffmpeg-mixer image:
    docker compose build ffmpeg-mixer
    docker compose up -d ffmpeg-mixer

Then test:
    curl http://localhost:8001/debug/chimes
    curl http://localhost:8001/debug/announcements
    curl http://localhost:8001/debug/library
"""

import os

# ── Paste these routes into deck_manager.py ──────────────────────────────────

@app.get("/debug/chimes")
def debug_chimes():
    """List all files the mixer can see in /chimes/"""
    path = "/chimes"
    try:
        files = sorted(os.listdir(path))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"chimes_path": path, "files": files, "count": len(files)}


@app.get("/debug/announcements")
def debug_announcements():
    """List all files the mixer can see in /announcements/"""
    path = "/announcements"
    try:
        files = sorted(os.listdir(path))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"announcements_path": path, "files": files, "count": len(files)}


@app.get("/debug/library")
def debug_library():
    """List all files the mixer can see in /library/"""
    path = "/library"
    try:
        files = sorted(os.listdir(path))
    except Exception as e:
        files = [f"ERROR: {e}"]
    return {"library_path": path, "files": files, "count": len(files)}
