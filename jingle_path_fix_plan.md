# CocoStation — Jingle Path Fix Plan

## Root Cause

The jingle file path breaks at the boundary between the API container
and the ffmpeg-mixer container because each container mounts the same
host folder at a DIFFERENT path:

| Container     | Host path        | Container path   |
|---------------|------------------|------------------|
| api           | ./data/chimes/   | /app/data/chimes |
| ffmpeg-mixer  | ./data/chimes/   | /chimes          |

The engine uses /chimes/<filename> for the mixer — which is correct
per docker-compose.yml. So if the mixer still says "No such file or
directory", the file simply does not exist inside the container yet.

---

## Step 1 — Verify the file exists on the HOST machine

Run this on your server (where docker-compose runs):

    ls -la ./data/chimes/

If the folder is empty → the upload never wrote the file to disk.
If the file is there → go to Step 2.

---

## Step 2 — Verify the mixer container can see the file

    docker exec cc_ffmpeg ls -la /chimes/

If empty but host has files → restart the mixer:

    docker compose restart ffmpeg-mixer

If still empty after restart → the volume mount is broken.
Check with:

    docker inspect cc_ffmpeg | grep -A 20 Mounts

You should see something like:
    "Source": "/your/path/CocoStation/data/chimes",
    "Destination": "/chimes",

---

## Step 3 — Verify the setting stored in DB matches the filename

    docker exec cc_api python3 -c "
    from db_client import db
    s = db.get_settings()
    print('intro:', s.get('jingle_intro'))
    print('outro:', s.get('jingle_outro'))
    "

The value must exactly match the filename in /chimes/.
Standard names are:
    global_jingle_intro.mp3
    global_jingle_outro.mp3

---

## Step 4 — Re-upload jingles correctly

Use the UI or these curl commands:

    # Get a token first
    TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"username":"admin","password":"yourpassword"}' \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

    # Upload intro jingle
    curl -X POST http://localhost:8000/api/settings/jingles/intro/upload \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@/path/to/intro.mp3"

    # Upload outro jingle
    curl -X POST http://localhost:8000/api/settings/jingles/outro/upload \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@/path/to/outro.mp3"

    # Confirm both are set and exist on disk
    curl -s http://localhost:8000/api/settings/jingles/status \
      -H "Authorization: Bearer $TOKEN"

Expected response:
    {"intro":{"filename":"global_jingle_intro.mp3","exists":true},
     "outro":{"filename":"global_jingle_outro.mp3","exists":true}}

---

## Step 5 — Add a debug endpoint to the mixer (see fix_mixer_debug.py)

This lets you verify what /chimes/ looks like from inside the mixer
without needing docker exec:

    curl http://localhost:8001/debug/chimes

---

## Correct path mapping summary

  What            | API container (ffprobe)              | Mixer container (ffmpeg)
  ----------------|--------------------------------------|---------------------------
  Intro jingle    | data/chimes/global_jingle_intro.mp3  | /chimes/global_jingle_intro.mp3
  Outro jingle    | data/chimes/global_jingle_outro.mp3  | /chimes/global_jingle_outro.mp3
  Announcement    | data/announcements/foo.mp3           | /announcements/foo.mp3
  Library track   | data/library/foo.mp3                 | /library/foo.mp3
