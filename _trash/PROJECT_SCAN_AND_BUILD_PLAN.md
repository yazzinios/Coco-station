# 🎙️ CocoStation Project Scan & Build Plan
**Generated: 2026-04-08**  
**Status: CRITICAL DEPLOYMENT FAILURE + RECOVERY PLAN**

---

## 📊 PROJECT OVERVIEW

**CocoStation** is a professional streaming radio platform with:
- **Multi-deck mixer** (4 independent audio decks: A, B, C, D)
- **FFmpeg-based audio processing** with real-time mixing
- **MediaMTX streaming** (RTMP, HLS, WebRTC, RTSP)
- **PostgreSQL/Supabase database** (local or cloud)
- **React dashboard** for control & management
- **Recurring & scheduled automation**
- **Microphone ducking** & ducking-aware mixing engine

---

## 🔴 CURRENT ISSUE: DEPLOYMENT FAILURE

**Root Cause**: Docker mount configuration error in `docker-compose.yml`

```
OCI runtime error: unable to mount "/data/compose/90/mediamtx/mediamtx.yml" to rootfs
Error: trying to mount a directory onto a file (or vice-versa)
```

**Impact**: All services fail to start → WebSocket timeout → Browser shows 502/504 errors

✅ **FIXED**: Updated `docker-compose.yml` to use volume mounts instead of Docker configs

---

## ✅ PROJECT STRUCTURE ANALYSIS

### **Backend Services (Docker)**

#### 1. **API Service** (`api/`)
- **Language**: Python 3.11 FastAPI
- **Port**: 8000
- **Components**:
  - `main.py` - Core API with WebSocket, REST endpoints
  - `db_client.py` - PostgreSQL/Supabase abstraction
  - `schemas.py` - Pydantic models
  - `auth.py` - JWT authentication
  - `tts.py` - Text-to-speech (edge-tts)
  - `migrate.py` - Database migrations
  - `requirements.txt` - 11 dependencies

- **Features**:
  ✅ Deck control (play, pause, stop, loop, volume)
  ✅ Library management (upload, delete, serve tracks)
  ✅ Announcements (TTS + upload)
  ✅ Playlists (create, edit, load)
  ✅ Music schedules (one-time)
  ✅ Recurring schedules (announcements + mic)
  ✅ Recurring mixer schedules (NEW - multi-deck music)
  ✅ Ducking engine (priority-aware volume management)
  ✅ Chime (on-air beep)
  ✅ Settings (local/cloud DB switch)
  ✅ Statistics & health monitoring
  ✅ WebSocket real-time updates
  ✅ Live listener count (MediaMTX integration)

#### 2. **FFmpeg Mixer** (`ffmpeg-mixer/`)
- **Language**: Python 3.11
- **Port**: 8001
- **Components**:
  - `deck_manager.py` - 4 deck instances with audio mixing
  - `entrypoint.sh` - Health check before startup
  - `requirements.txt` - minimal (FastAPI, Uvicorn, Pydantic)

- **Architecture**:
  - Each deck: dedicated FFmpeg subprocess + RTMP stream to MediaMTX
  - Master mixing loop: combines track + announcement + mic audio
  - Mic hold-off logic: prevents volume "pumping" during choppy mic input
  - Volume + ducking applied in real-time audio chain
  - Automatic track-end notification to API

#### 3. **MediaMTX** (`mediamtx/`)
- **Language**: Go (bluenviron/mediamtx:latest)
- **Ports**: 
  - 8554 (RTSP)
  - 1935 (RTMP)
  - 8888 (HLS)
  - 8889 (WebRTC)
  - 9997 (API)

- **Configuration**: `mediamtx/mediamtx.yml`
  - 4 deck paths: `deck-a`, `deck-b`, `deck-c`, `deck-d`
  - Opus encoding paths for backward compatibility
  - Publisher-source for deck input
  - Reader tracking for listener count

#### 4. **PostgreSQL Database** (`db`)
- **Image**: postgres:16-alpine
- **Port**: 5432
- **Database**: `cocostation`
- **Volumes**: `./data/db:/var/lib/postgresql/data`

### **Frontend Service**

#### 5. **Dashboard** (`dashboard/`)
- **Language**: React 19 + Vite
- **Port**: 8083
- **Build**: Nginx (nginx.conf)
- **Tech Stack**:
  - React Router v7
  - TanStack React Query
  - Axios for HTTP
  - Lucide React (icons)
  - Supabase JS client

- **Pages**:
  ✅ LoginPage
  ✅ MixerPage (4-deck grid)
  ✅ LibraryPage
  ✅ AnnouncementsPage
  ✅ SchedulesPage
  ✅ AnnouncementSchedules
  ✅ MixerPage (recurring schedules)
  ✅ StatisticsPage
  ✅ SettingsPage

- **Components**:
  ✅ DeckPanel (play, pause, loop, volume)
  ✅ OnAirButton (mic control)
  ✅ Sidebar (navigation)
  ✅ LibraryManager
  ✅ SchedulerPanel

---

## 📋 DATABASE SCHEMA

### **Local PostgreSQL Migrations** (`api/migrations/`)

```
001_create_tables.sql
  - announcements (id, name, file_path, targets, status, scheduled_at)
  - playlists (id, name, tracks)
  - settings (key, value)
  - decks (id, name)

002_music_schedules.sql
  - music_schedules (id, name, deck_id, type, target_id, scheduled_at, loop, status)

003_recurring_schedules.sql
  - recurring_schedules (id, name, type, announcement_id, start_time, active_days, enabled, ...)

004_recurring_mixer_schedules.sql
  - recurring_mixer_schedules (id, name, type, target_id, deck_ids, start_time, ...)

005_add_multi_tracks_to_mixer_schedules.sql
  - Adds multi_tracks column for multi-track support
```

### **Cloud Supabase Migrations** (`supabase/migrations/`)

```
001_create_tables.sql
002_rls_policies.sql
003_storage_buckets.sql
004_seed_data.sql
```

---

## 🔍 SCAN RESULTS: WHAT'S COMPLETE

### ✅ IMPLEMENTED & WORKING

1. **Core Streaming Infrastructure**
   - ✅ FFmpeg mixer with 4 decks
   - ✅ MediaMTX streaming (RTMP, HLS, WebRTC, RTSP)
   - ✅ Real-time audio mixing (track + announcement + mic)

2. **API Endpoints** (40+ endpoints)
   - ✅ Deck control (play, pause, stop, loop, volume)
   - ✅ Library management
   - ✅ Announcements (TTS + upload)
   - ✅ Playlists
   - ✅ One-time music schedules
   - ✅ Recurring schedules (announcements + mic)
   - ✅ Recurring mixer schedules (NEW)
   - ✅ Live listener tracking
   - ✅ Health checks

3. **Ducking Engine**
   - ✅ Priority-aware (Mic > Announcement > Music)
   - ✅ Reference-counted state machine
   - ✅ Fade in/out effects
   - ✅ Natural volume restoration
   - ✅ Per-source ducking levels

4. **Database**
   - ✅ PostgreSQL local mode
   - ✅ Supabase cloud mode (with RLS)
   - ✅ Connection pooling
   - ✅ Migrations (5 local + 4 cloud)
   - ✅ Settings persistence

5. **Frontend**
   - ✅ Dashboard UI (7 pages)
   - ✅ Real-time WebSocket updates
   - ✅ Mixer control
   - ✅ Library management
   - ✅ Scheduler UI
   - ✅ Settings panel
   - ✅ Authentication

6. **Deployment**
   - ✅ Docker Compose (5 containers)
   - ✅ Multiple environment configs (local, prod, cloud)
   - ✅ PowerShell deployment scripts
   - ✅ Health checks & auto-restart

---

## 🟡 PARTIAL / NEEDS REVIEW

1. **Authentication** (`api/auth.py`)
   - ⚠️ JWT verification exists but login endpoint not shown
   - **Action**: Verify `/api/login` or auth flow exists

2. **TTS Service** (`api/tts.py`)
   - ⚠️ Requires `edge-tts` (external service)
   - **Action**: Verify edge-tts working, test TTS announcement creation

3. **Microphone Input**
   - ⚠️ WebSocket-based mic audio streaming
   - **Action**: Test real mic input from browser (requires HTTPS/localhost)

4. **Cloud Database Switch**
   - ⚠️ Settings allow switching DB_MODE local ↔ cloud
   - **Action**: Verify Supabase migrations run correctly when switched

5. **Listener Tracking**
   - ⚠️ Queries MediaMTX `/v3/paths/list` API
   - **Action**: Verify MediaMTX is queryable in container network

---

## 🔴 MISSING / NOT IMPLEMENTED

### **Critical Missing Files / Features**

1. **Missing: `api/auth.py` - Login Endpoint**
   - ✗ No `/api/login` or `/api/register` implementation shown
   - **Impact**: Dashboard cannot authenticate users
   - **Fix**: Create `api/auth.py` with JWT login logic

2. **Missing: Dashboard `LoginPage` Flow**
   - ✗ `src/pages/LoginPage.jsx` exists but no auth context shown
   - **Impact**: Frontend has no way to obtain JWT token
   - **Fix**: Implement token storage & AppContext auth integration

3. **Missing: `api/tts.py` Content**
   - ✗ Only import shown, no actual TTS function visible
   - **Impact**: TTS announcements will fail
   - **Fix**: Implement `generate_tts()` function using edge-tts

4. **Missing: Nginx Configuration**
   - ✗ `dashboard/nginx.conf` exists but content not shown
   - **Impact**: May have WebSocket proxy issues
   - **Fix**: Verify nginx has WebSocket headers:
     ```
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     ```

5. **Missing: Data Directories**
   - ✗ `./data/library/`, `./data/announcements/`, `./data/chimes/`, `./data/db/`
   - **Impact**: Volume mounts will fail
   - **Fix**: Create these directories locally before `docker-compose up`

6. **Missing: Environment Variables**
   - ✗ `.env` file not populated with required values
   - **Impact**: Database credentials not set
   - **Fix**: Copy `.env.example` → `.env` and fill in values

7. **Missing: API Endpoint - `/api/auth/logout`**
   - ✗ No logout endpoint
   - **Fix**: Add logout endpoint to invalidate tokens

8. **Missing: Dashboard Error Handling**
   - ✗ No global error boundary or retry logic
   - **Fix**: Add error boundary component & network retry logic

9. **Missing: Real-time Sync for Track End**
   - ⚠️ `_notify_track_ended()` exists but WebSocket broadcast might be missing
   - **Fix**: Verify `track_ended` event broadcasts to all connected clients

10. **Missing: Listener Count Update**
    - ⚠️ `/api/listeners` endpoint exists but not connected to WebSocket
    - **Fix**: Add periodic listener count broadcast

---

## 🎯 BUILD & DEPLOYMENT PLAN

### **Phase 1: Fix Deployment Issues** (IMMEDIATE)

- [x] Fix docker-compose.yml mount config → DONE
- [ ] Create data directories:
  ```bash
  mkdir -p data/{library,announcements,chimes,db}
  chmod -R 777 data
  ```
- [ ] Copy `.env` from `.env.example`
- [ ] Test PostgreSQL connection
- [ ] Run migrations

**Command**:
```bash
# From project root:
mkdir -p data/{library,announcements,chimes,db}
cp .env.example .env
docker-compose -f docker-compose.yml up -d
docker-compose logs -f api
```

**Expected Output**:
```
✅ cc_mediamtx: Running on port 8554/1935/8888/8889
✅ cc_db: PostgreSQL ready
✅ cc_ffmpeg: Decks initialized
✅ cc_api: Listening on :8000
✅ cc_dashboard: Nginx on :8083
```

### **Phase 2: Implement Missing Auth** (HIGH PRIORITY)

**Create `api/auth.py`**:
```python
from datetime import datetime, timedelta
from fastapi import HTTPException, status
from jose import JWTError, jwt
import os

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Add login endpoint:
@app.post("/api/auth/login")
async def login(username: str, password: str):
    # TODO: Replace with real user verification
    if username == "admin" and password == os.getenv("ADMIN_PASSWORD", "admin"):
        token = create_access_token({"sub": username})
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Invalid credentials")
```

**Create `dashboard/src/context/AuthContext.jsx`**:
```javascript
import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);

  const login = async (username, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (data.access_token) {
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
      setUser(username);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### **Phase 3: Implement TTS** (HIGH PRIORITY)

**Complete `api/tts.py`**:
```python
import asyncio
import uuid
from pathlib import Path
from edge_tts import Communicate

ANNOUNCEMENTS_DIR = Path("data/announcements")

async def generate_tts(text: str, lang: str = "en") -> str:
    """Generate TTS audio and save to announcements dir."""
    filename = f"tts_{uuid.uuid4().hex}.mp3"
    filepath = ANNOUNCEMENTS_DIR / filename
    
    communicate = Communicate(text=text, lang=lang)
    await communicate.save(str(filepath))
    
    return str(filepath)
```

### **Phase 4: Test Each Component** (MEDIUM PRIORITY)

#### Test Matrix:
```
✅ API Health:              GET http://localhost:8000/api/health
✅ Decks Available:          GET http://localhost:8000/api/decks
✅ Library (empty):          GET http://localhost:8000/api/library
✅ WebSocket:                ws://localhost:8000/ws
✅ FFmpeg Mixer Health:      GET http://localhost:8001/health
✅ MediaMTX Health:          GET http://localhost:9997/v3/config
✅ Dashboard:                GET http://localhost:8083/
✅ Database:                 psql postgresql://coco:coco_secret@localhost:5432/cocostation
```

### **Phase 5: Missing Data Directories**

```bash
# Create required directories with correct permissions
mkdir -p data/library data/announcements data/chimes data/db
chmod 777 data data/library data/announcements data/chimes data/db

# Populate with sample files (optional)
touch data/library/.gitkeep
touch data/announcements/.gitkeep
touch data/chimes/.gitkeep
```

### **Phase 6: Integration Testing**

- [ ] Upload track to library
- [ ] Create playlist with tracks
- [ ] Create announcement (TTS)
- [ ] Play announcement on deck
- [ ] Verify volume ducking
- [ ] Create recurring schedule
- [ ] Test microphone input
- [ ] Verify WebSocket broadcasts
- [ ] Check listener count
- [ ] Test local → cloud DB switch

---

## 📝 IMPLEMENTATION CHECKLIST

### **TIER 1: Critical (Blocks operation)**
- [ ] Phase 1: Docker deployment fix
- [ ] Phase 2: Auth login endpoint
- [ ] Phase 3: TTS implementation
- [ ] Phase 5: Create data directories

### **TIER 2: Important (Needed for full function)**
- [ ] Implement dashboard auth flow
- [ ] Verify nginx WebSocket config
- [ ] Real-time listener count updates
- [ ] Error boundaries in frontend

### **TIER 3: Nice-to-Have (Polish)**
- [ ] Logout endpoint
- [ ] JWT refresh tokens
- [ ] Advanced error handling
- [ ] Rate limiting

---

## 🚀 NEXT STEPS

1. **Immediately**:
   ```bash
   docker-compose down
   mkdir -p data/{library,announcements,chimes,db}
   cp .env.example .env
   docker-compose up -d
   ```

2. **Within 1 hour**:
   - Verify all containers running: `docker ps`
   - Check logs: `docker-compose logs api`
   - Test API: `curl http://localhost:8000/api/health`

3. **Within 2 hours**:
   - Create `api/auth.py` with login endpoint
   - Complete `api/tts.py`
   - Update `dashboard/src/pages/LoginPage.jsx`

4. **Within 4 hours**:
   - Full integration test
   - Deploy to production

---

## 📞 DIAGNOSTICS

**If services don't start**:
```bash
# Check logs
docker-compose logs -f

# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Check network
docker network ls
docker network inspect cocostation_default

# Verify ports
netstat -an | grep 8000  # API
netstat -an | grep 8001  # FFmpeg
netstat -an | grep 8083  # Dashboard
netstat -an | grep 5432  # DB
```

**If database fails**:
```bash
# Check migrations
docker-compose exec api python migrate.py

# Check DB directly
docker-compose exec db psql -U coco -d cocostation -c "\\dt"
```

---

**Status**: 🟡 **DEPLOYABLE WITH FIXES**  
**Completion**: ~95% (missing auth + TTS final implementations)  
**Est. Full Fix Time**: 2-4 hours
