# 🏗️ CocoStation Architecture & System Design

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXTERNAL CLIENTS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  🖥️  Dashboard (http://localhost:8083)  👂 Listeners (HLS/RTMP) │
│         React SPA                         VLC Players            │
│         WebSocket ↔ API                   Mobile Apps            │
│         Real-time UI Updates              Web Browsers           │
│                                                                   │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼ HTTP REST / WebSocket
        ┌──────────────────┐
        │                  │
        │  🌐 Nginx Proxy  │
        │  Port 8083       │
        │  (Dashboard)     │
        │                  │
        └──────────────────┘
               │
━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    Docker Network: cocostation_default
━━━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
               │
        ┌──────┴────────────────────────────────────┐
        │                                            │
        ▼                                            ▼
    ┌────────────┐                            ┌──────────────┐
    │ 🎛️  API    │◄─────────────────────────►│ 🎵 FFmpeg    │
    │ FastAPI    │                            │ Mixer        │
    │ :8000      │     HTTP 8001              │ :8001        │
    │            │◄─────────────────────────►│              │
    │ - Decks    │     (Deck Control)         │ - 4 Decks    │
    │ - Library  │                            │ - Real-time  │
    │ - Schedule │     ↕ Queue based          │   Mixing     │
    │ - Auth     │     Signal passing         │ - Audio Out  │
    │ - WebSocket│                            │   (RTMP)     │
    │            │                            │              │
    └──────┬─────┘                            └──────┬───────┘
           │                                         │
           │ WebSocket                               │ RTMP (1935)
           │ Broadcast                               │ Stream Push
           │                                         │
           ▼                                         ▼
      ┌──────────────┐                      ┌───────────────────┐
      │ 📡 MediaMTX  │                      │ Audio Formats:    │
      │ Streaming    │                      │ - Decks A, B, C, D│
      │ :8554 (RTSP) │                      │ 44100 Hz, 2ch,    │
      │ :1935 (RTMP) │◄─────RTMP────────────│ 16-bit LE PCM    │
      │ :8888 (HLS)  │                      │ + Ducking Applied │
      │ :8889 (WebRTC)                      └───────────────────┘
      │ :9997 (API)  │
      │              │
      │ Paths:       │
      │ - deck-a     │
      │ - deck-b     │
      │ - deck-c     │
      │ - deck-d     │
      └──────┬───────┘
             │
      ┌──────┴──────────────────┐
      │ HLS/RTMP/WebRTC/RTSP   │
      │ Stream Output           │
      │ → External listeners    │
      │ → Analytics             │
      │ → Recording             │
      └────────────────────────┘


        ┌──────────────┐
        │  🐘 PostgreSQL│
        │  DB :5432    │
        │              │
        │ Tables:      │
        │ - decks      │
        │ - settings   │
        │ - library    │
        │ - playlists  │
        │ - scheds     │
        │ - recurring  │
        │ - mixer-sch. │
        │              │
        └──────────────┘
             ▲
             │ SQL (localhost:5432)
             │
        ┌────┴────────────────┐
        │ FastAPI (api)       │
        │ Migrations + CRUD   │
        └─────────────────────┘
```

---

## Data Flow Diagrams

### 1. Deck Playback Flow

```
┌─────────────────┐
│  Dashboard UI   │
│  [Play Button]  │
└────────┬────────┘
         │ HTTP POST /api/decks/{id}/play
         ▼
    ┌──────────────┐
    │  FastAPI     │ 1. Mark deck as "is_playing=True"
    │  main.py     │ 2. Construct filepath
    └────┬─────────┘ 3. HTTP POST to FFmpeg
         │
         │ HTTP POST :8001/decks/{id}/play
         ▼
    ┌─────────────────────────────┐
    │  FFmpeg Mixer (deck_manager)│
    │  1. Stop previous process   │
    │  2. Spawn ffmpeg process    │
    │  3. Thread reads PCM chunks │
    │  4. Enqueue to track_q      │
    └────┬────────────────────────┘
         │
         ▼ (Mix loop @ 44.1kHz)
    ┌─────────────────────────────┐
    │  _mix_loop()                │
    │  • Get chunk from track_q   │
    │  • Apply volume (× volume%) │
    │  • If mic active → duck     │
    │  • Mix with announcement    │
    │  • Mix with mic             │
    │  • Write to RTMP encoder    │
    └────┬────────────────────────┘
         │
         │ ffmpeg encode to AAC+FLV
         ▼
    ┌────────────────┐
    │  RTMP Stream   │ (rtmp://mediamtx:1935/deck-a)
    │  to MediaMTX   │
    └────┬───────────┘
         │
         ▼
    ┌────────────────────────┐
    │  MediaMTX              │
    │  (bluenviron/mediamtx) │
    │  • Receive RTMP        │
    │  • Re-encode formats   │
    │  • HLS segments        │
    │  • WebRTC output       │
    └────┬───────────────────┘
         │
         ├──► HLS Playlist (port 8888)
         ├──► RTMP Relay (port 1935)
         ├──► RTSP (port 8554)
         └──► WebRTC (port 8889)
```

### 2. Announcement + Ducking Flow

```
┌──────────────────────────┐
│ User clicks "Play"       │
│ Announcement on deck A   │
└────────┬─────────────────┘
         │
         ▼
    ┌──────────────────────────┐
    │ API: /api/announcements  │
    │ /{id}/play               │
    └────┬─────────────────────┘
         │
         ▼ (Lock: _TRIGGER_LOCK)
    ┌──────────────────────────────────┐
    │ fade_and_play_announcement()      │
    │                                  │
    │ STATE 1: MUSIC_NORMAL (80%)      │
    │ ┌────────────────────────────┐   │
    │ │ Music Playing on deck A    │   │
    │ │ Volume: 80%                │   │
    │ └────────────────────────────┘   │
    └────┬─────────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │ STATE 2: PRE-TRIGGER                │
    │ Play on-air chime (optional)        │
    │ Music still at 80%                  │
    └────┬───────────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │ STATE 3: DUCK ACQUIRE               │
    │ _duck_acquire(source_type="ann")   │
    │ • Refcount: 0 → 1                  │
    │ • Save natural volumes: {a: 80}    │
    │ • Fade music: 80% → 5% (over 1s)  │
    │ • Lock held by trigger lock        │
    └────┬───────────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │ STATE 4: PLAY ANNOUNCEMENT          │
    │ HTTP POST ffmpeg:8001/ann          │
    │ deck_manager.play_announcement()    │
    │ • Spawn ffmpeg for announcement    │
    │ • Mix with ducked music (5%)       │
    │ • Play on deck A                   │
    │ • Wait for duration (~3s)          │
    └────┬───────────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │ STATE 5: POST-TRIGGER               │
    │ Play on-air chime (optional)        │
    │ Music still ducked at 5%            │
    └────┬───────────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │ STATE 6: RESTORE                    │
    │ _duck_release()                     │
    │ • Refcount: 1 → 0                  │
    │ • Fade music: 5% → 80% (over 2s)  │
    │ • Unlock trigger lock              │
    │ • Broadcast deck state update      │
    └────────────────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │ COMPLETE                            │
    │ Music back at 80%                   │
    │ Dashboard updated via WebSocket     │
    └────────────────────────────────────┘
```

### 3. Real-time State Update Flow

```
    Dashboard (Browser)
         │
         │ WebSocket: ws://localhost:8000/ws
         │
         ▼
    ┌──────────────────────────┐
    │ API: /ws                 │
    │ (ConnectionManager)      │
    │                          │
    │ store_connection(ws)     │
    │ await manager.broadcast()│
    └────────┬─────────────────┘
             │
             ├─────────────────────────────┐
             │                             │
             │ EVENT: DECK_STATE           │ EVENT: ANNOUNCEMENTS_UPDATED
             │ {type: "DECK_STATE",        │ {type: "ANNOUNCEMENTS_UPDATED",
             │  decks: [...]}              │  announcements: [...]}
             │                             │
             ▼                             ▼
    ┌──────────────────────┐     ┌──────────────────────┐
    │ Dashboard            │     │ Dashboard            │
    │ useApp() hook        │     │ useApp() hook        │
    │ setDecks(decks)      │     │ setAnnouncements()   │
    │ re-render DeckPanel  │     │ re-render Announce   │
    │ Update volumes visually   │ pages              │
    └──────────────────────┘     └──────────────────────┘
```

---

## Ducking Engine State Machine

```
                        ┌─────────────────────┐
                        │ INITIAL STATE       │
                        │ _DUCK_REFCOUNT = 0  │
                        │ Music: 100%         │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │ _duck_acquire() called      │
                    │ (announcement or mic)       │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │ DUCK STATE           │
                        │ _DUCK_REFCOUNT = 1   │
                        │ Music: 100% → 5%     │
                        │ (fade over 1 sec)    │
                        │ SAVED_VOLUMES = {a:100} │
                        └──────────────┬───────┘
                                       │
                    ┌──────────────────┴───────────────┐
                    │ More sources start?              │
                    │ _duck_acquire() again            │
                    │ (multiple announcements/mic mix) │
                    └──────────────────┬───────────────┘
                                       │
                                       ▼
                        ┌──────────────────────┐
                        │ MULTI-DUCK STATE     │
                        │ _DUCK_REFCOUNT = 2+  │
                        │ Music: 5% (stays)    │
                        │ SAVED_VOLUMES updated│
                        └──────────────┬───────┘
                                       │
                    ┌──────────────────┴──────────────┐
                    │ First source ends               │
                    │ _duck_release() called          │
                    │ Refcount: 2 → 1                 │
                    │ Other sources still active      │
                    │ Music stays ducked @ 5%         │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │ ALL SOURCES END      │
                        │ _duck_release() called│
                        │ _DUCK_REFCOUNT = 0   │
                        │ Music: 5% → SAVED%   │
                        │ (fade over 2 sec)    │
                        └──────────────┬───────┘
                                       │
                                       ▼
                        ┌──────────────────────┐
                        │ RESTORED STATE       │
                        │ Music: back to normal│
                        │ (100% or previous %) │
                        │ Ready for next event │
                        └──────────────────────┘
```

---

## API Endpoint Hierarchy

```
🔐 Protected (JWT Required)
🔓 Public

/api
├── 🔓 GET    /health                    → Health status
├── 🔓 GET    /                          → Server info
├── 🔐 WEBSOCKET /ws                     → Real-time updates

Decks
├── 🔓 GET    /decks                     → List all decks
├── 🔐 PUT    /decks/{id}/name           → Rename deck
├── 🔐 POST   /decks/{id}/load           → Load track
├── 🔐 POST   /decks/{id}/unload         → Unload track
├── 🔐 POST   /decks/{id}/play           → Play
├── 🔐 POST   /decks/{id}/pause          → Pause/Resume
├── 🔐 POST   /decks/{id}/stop           → Stop
├── 🔐 POST   /decks/{id}/loop           → Toggle loop
├── 🔐 POST   /decks/{id}/volume/{level} → Set volume
├── 🔐 POST   /decks/{id}/playlist       → Load playlist
├── 🔐 POST   /decks/{id}/next           → Next track
├── 🔐 POST   /decks/{id}/previous       → Previous track
└── 🔓 POST   /decks/{id}/track_ended    → Track end notify

Library
├── 🔓 GET    /library                   → List files
├── 🔐 POST   /library/upload            → Upload track
├── 🔐 DELETE /library/{filename}        → Delete track
└── 🔓 GET    /library/file/{filename}   → Download file

Playlists
├── 🔓 GET    /playlists                 → List playlists
├── 🔐 POST   /playlists                 → Create playlist
├── 🔐 PUT    /playlists/{id}            → Edit playlist
└── 🔐 DELETE /playlists/{id}            → Delete playlist

Announcements
├── 🔓 GET    /announcements             → List announcements
├── 🔐 POST   /announcements/tts         → Create TTS
├── 🔐 POST   /announcements/upload      → Upload file
├── 🔐 POST   /announcements/{id}/play   → Play now
├── 🔐 PUT    /announcements/{id}        → Edit
└── 🔐 DELETE /announcements/{id}        → Delete

Microphone
├── 🔐 POST   /mic/on                    → Start mic
├── 🔐 POST   /mic/off                   → Stop mic
└── 🔓 GET    /mic/status                → Mic state

Schedules (One-time)
├── 🔓 GET    /music-schedules           → List schedules
├── 🔐 POST   /music-schedules           → Create schedule
├── 🔐 DELETE /music-schedules/{id}      → Delete
└── 🔐 POST   /music-schedules/{id}/trigger → Trigger now

Recurring (Announcements/Mic)
├── 🔓 GET    /recurring-schedules       → List schedules
├── 🔐 POST   /recurring-schedules       → Create schedule
├── 🔐 PUT    /recurring-schedules/{id}  → Edit
└── 🔐 DELETE /recurring-schedules/{id}  → Delete

Recurring Mixer (Music/Deck)
├── 🔓 GET    /recurring-mixer-schedules → List schedules
├── 🔐 POST   /recurring-mixer-schedules → Create schedule
├── 🔐 PUT    /recurring-mixer-schedules/{id} → Edit
└── 🔐 DELETE /recurring-mixer-schedules/{id} → Delete

Chime (On-Air Beep)
├── 🔐 POST   /settings/chime/upload     → Upload chime
├── 🔓 GET    /settings/chime/status     → Chime status
└── 🔐 DELETE /settings/chime            → Delete chime

Settings
├── 🔓 GET    /settings                  → Get settings
├── 🔐 POST   /settings                  → Update settings
└── 🔐 POST   /settings/db-test          → Test DB connection

Statistics
├── 🔓 GET    /stats                     → Playback stats
└── 🔓 GET    /listeners                 → Live listener count
```

---

## Database Schema

```
┌─────────────────────────────────────────────────────────┐
│                      PostgreSQL                         │
│                 Database: cocostation                   │
└─────────────────────────────────────────────────────────┘

┌────────────────────────┐
│ announcements          │
├────────────────────────┤
│ id (UUID)              │
│ name (text)            │
│ type (mp3/tts)         │
│ file_path (text)       │
│ targets (json)         │
│ text (text) [TTS]      │
│ lang (text) [TTS]      │
│ status (scheduled/ready/played)
│ schedule_at (timestamp)│
│ created_at (timestamp) │
└────────────────────────┘

┌────────────────────────┐
│ playlists              │
├────────────────────────┤
│ id (UUID)              │
│ name (text)            │
│ tracks (json array)    │
│ created_at (timestamp) │
│ updated_at (timestamp) │
└────────────────────────┘

┌────────────────────────┐
│ music_schedules        │
├────────────────────────┤
│ id (UUID)              │
│ name (text)            │
│ deck_id (char)         │
│ type (track/playlist)  │
│ target_id (text)       │
│ scheduled_at (timestamp)
│ loop (boolean)         │
│ status (scheduled/played)
│ created_at (timestamp) │
└────────────────────────┘

┌────────────────────────────────┐
│ recurring_schedules            │
├────────────────────────────────┤
│ id (UUID)                      │
│ name (text)                    │
│ type (announcement/microphone) │
│ announcement_id (UUID)         │
│ start_time (HH:MM)             │
│ active_days (json array)       │
│ excluded_days (json array)     │
│ fade_duration (int)            │
│ music_volume (int)             │
│ target_decks (json array)      │
│ jingle_start (text) [optional] │
│ jingle_end (text) [optional]   │
│ enabled (boolean)              │
│ last_run_date (date)           │
│ created_at (timestamp)         │
└────────────────────────────────┘

┌────────────────────────────────┐
│ recurring_mixer_schedules      │
├────────────────────────────────┤
│ id (UUID)                      │
│ name (text)                    │
│ type (track/playlist/multi_tr) │
│ target_id (text)               │
│ deck_ids (json array)          │
│ start_time (HH:MM)             │
│ active_days (json array)       │
│ excluded_days (json array)     │
│ fade_in (int)                  │
│ fade_out (int)                 │
│ volume (int) [0-100]           │
│ loop (boolean)                 │
│ multi_tracks (json array)      │
│ jingle_start (text) [optional] │
│ jingle_end (text) [optional]   │
│ enabled (boolean)              │
│ last_run_date (date)           │
│ created_at (timestamp)         │
└────────────────────────────────┘

┌────────────────────────┐
│ settings               │
├────────────────────────┤
│ key (text) [PK]        │
│ value (jsonb)          │
└────────────────────────┘

┌────────────────────────┐
│ decks                  │
├────────────────────────┤
│ id (char) [PK]         │
│ name (text)            │
│ created_at (timestamp) │
└────────────────────────┘
```

---

## Audio Signal Flow (FFmpeg Mixer)

```
Multiple Sources → Mix Loop @ 44100 Hz, 2-channel, 16-bit

Source 1: Track Audio       → track_q (Queue)
Source 2: Announcement      → ann_q (Queue)  
Source 3: Microphone Input  → mic_q (Queue)

┌─────────────────────────────────────────────────────────┐
│                      _mix_loop()                        │
│                                                         │
│ while True:                                             │
│                                                         │
│   1. Get track chunk from track_q (or silence)          │
│      • Applied volume: chunk × (volume% / 100)          │
│      • If mic active: chunk × (duck_volume% / 100)      │
│                                                         │
│   2. Get announcement chunk from ann_q (or silence)     │
│                                                         │
│   3. Get microphone chunk from mic_q (or silence)       │
│      • Update _mic_last_active timestamp               │
│      • Check mic_holdoff to prevent volume pumping     │
│                                                         │
│   4. Mix (add all sources):                             │
│      • mixed = track + announcement + mic               │
│      • Clipping prevention via audioop.add()           │
│                                                         │
│   5. Write to RTMP encoder stdin:                       │
│      • ffmpeg encodes PCM → AAC+FLV                    │
│      • Sends to rtmp://mediamtx:1935/deck-{id}        │
│                                                         │
│   6. Sleep until next tick (@ CHUNK_DURATION)           │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                ┌──────────────────────┐
                │  RTMP Encoder        │
                │  ffmpeg AAC          │
                │  128 kbps            │
                │  44100 Hz            │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  MediaMTX            │
                │  Receive RTMP stream │
                │  Re-encode formats:  │
                │  • HLS (segments)    │
                │  • RTMP relay        │
                │  • RTSP              │
                │  • WebRTC            │
                └──────────┬───────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
          HLS Stream   RTMP Stream   WebRTC Stream
           :8888         :1935        :8889
```

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────┐
│                  Docker Host                     │
│           (Windows / Linux / macOS)             │
└──────────────────────────────────────────────────┘
             │
      ┌──────┴──────────────┐
      │ Docker Daemon       │
      │ docker-compose.yml  │
      └──────┬──────────────┘
             │
    ┌────────┴────────────────────────┐
    │                                  │
    ▼                                  ▼
┌─────────────────────┐      ┌──────────────────┐
│ Docker Network      │      │ Named Volumes    │
│ cocostation_default │      │ & Mounts         │
│ (custom bridge)     │      │                  │
│                     │      │ ./data/          │
│ Container IPs:      │      │ └─ library/      │
│ - api: 172.x.x.x   │      │ └─ annotations/  │
│ - ffmpeg: 172.x.x.x│      │ └─ chimes/       │
│ - mediamtx: 172.x  │      │ └─ db/           │
│ - db: 172.x.x.x    │      │    (PostgreSQL)  │
│ - dashboard: 172.x │      └──────────────────┘
│                     │
│ Service Discovery:  │
│ - api:8000 (DNS)    │
│ - ffmpeg:8001       │
│ - mediamtx:9997     │
│ - db:5432           │
└─────────────────────┘
     │ Port Bindings
     │
     ├─ :8000 → API (FastAPI)
     ├─ :8001 → FFmpeg Mixer
     ├─ :8083 → Dashboard (Nginx)
     ├─ :8554 → MediaMTX RTSP
     ├─ :8888 → MediaMTX HLS
     ├─ :8889 → MediaMTX WebRTC
     ├─ :1935 → MediaMTX RTMP
     ├─ :9997 → MediaMTX API
     └─ :5432 → PostgreSQL (optional, expose for tools)
```

---

## Summary

**Total Components**: 5 (API, FFmpeg, MediaMTX, PostgreSQL, Dashboard)  
**Total Endpoints**: 40+  
**Supported Formats**: MP3, WAV, OGG, FLAC, AAC, M4A (input); AAC+FLV (RTMP), HLS, RTSP, WebRTC (output)  
**Real-time Connections**: WebSocket (dashboard), RTMP (streaming)  
**Database**: PostgreSQL 16 (local) or Supabase (cloud)  
**Authentication**: JWT (local mode disabled for dev, cloud mode via Supabase)  
**Scalability**: Multi-deck architecture supports 4 independent streams  
**Ducking Engine**: Priority-based (Mic > Announcement > Music) with smooth fade in/out  

---

**Reference**: See PROJECT_SCAN_AND_BUILD_PLAN.md for complete implementation details
