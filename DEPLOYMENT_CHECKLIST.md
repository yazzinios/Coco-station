# 🚀 CocoStation Deployment Checklist
**Quick Start Guide**

---

## ✅ PHASE 1: ENVIRONMENT SETUP (5 min)

### Step 1.1: Verify Project Structure
```bash
cd C:\Users\YASSINE BERKAOUI\Desktop\CocoStation
ls -la
```

Expected directories:
```
✅ api/              (FastAPI backend)
✅ dashboard/        (React frontend)
✅ ffmpeg-mixer/     (Audio mixing)
✅ mediamtx/         (Streaming)
✅ supabase/         (Cloud migrations)
✅ docker-compose.yml (5 services)
✅ .env.example      (Template)
```

### Step 1.2: Create Data Directories
```bash
mkdir -p data/{library,announcements,chimes,db}
chmod 777 data data/library data/announcements data/chimes data/db
```

### Step 1.3: Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```ini
DB_MODE=local                          # Use local PostgreSQL

POSTGRES_USER=coco
POSTGRES_PASSWORD=coco_secret
POSTGRES_DB=cocostation
POSTGRES_HOST=db

# Only fill if using cloud mode (DB_MODE=cloud):
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
```

### Step 1.4: Verify Docker Installation
```bash
docker --version          # Docker >= 20.10
docker-compose --version  # Docker Compose >= 1.29
```

---

## ✅ PHASE 2: CONTAINER DEPLOYMENT (5-10 min)

### Step 2.1: Start Services
```bash
# From project root:
docker-compose -f docker-compose.yml up -d
```

### Step 2.2: Verify Containers
```bash
docker ps
```

Expected output:
```
CONTAINER ID   IMAGE                      PORTS                    NAMES
xxxxx          cocostation_api:latest     0.0.0.0:8000->8000      cc_api
xxxxx          cocostation_ffmpeg:latest  0.0.0.0:8001->8001      cc_ffmpeg
xxxxx          bluenviron/mediamtx:latest 0.0.0.0:8554->8554/tcp  cc_mediamtx
xxxxx          postgres:16-alpine         0.0.0.0:5432->5432      cc_db
xxxxx          cocostation_dashboard:latest 0.0.0.0:8083->80      cc_dashboard
```

### Step 2.3: Monitor Logs
```bash
# Watch all containers
docker-compose logs -f

# Or individual services:
docker-compose logs -f api      # See API startup
docker-compose logs -f ffmpeg   # See deck initialization
docker-compose logs -f db       # See PostgreSQL startup
```

**Expected Log Output**:
```
cc_db           | PostgreSQL database system is ready
cc_api          | [startup] Loaded 4 deck names from DB.
cc_api          | [startup] Loaded playlists from DB.
cc_ffmpeg       | [Deck a] Master RTMP stream started
cc_api          | Application startup complete
cc_mediamtx     | MediaMTX ready
cc_dashboard    | Nginx listening on :80
```

### Step 2.4: Wait for Full Startup (30 seconds)
The API needs time to:
- Connect to PostgreSQL
- Run migrations
- Load playlists & schedules
- Initialize decks

```bash
sleep 30
docker-compose logs api | grep "Application startup"
```

---

## ✅ PHASE 3: SERVICE HEALTH CHECKS (2 min)

### Test All Services

#### 3.1 API Health
```bash
curl -X GET http://localhost:8000/api/health
```
**Expected**:
```json
{
  "status": "healthy",
  "uptime_seconds": 45,
  "decks": 4,
  "library_count": 0,
  "announcements_count": 0
}
```

#### 3.2 FFmpeg Mixer Health
```bash
curl -X GET http://localhost:8001/health
```
**Expected**:
```json
{
  "status": "ok",
  "decks": {
    "a": { "playing": false, "track": null, ... },
    "b": { "playing": false, "track": null, ... },
    "c": { "playing": false, "track": null, ... },
    "d": { "playing": false, "track": null, ... }
  }
}
```

#### 3.3 Decks Available
```bash
curl -X GET http://localhost:8000/api/decks
```
**Expected**:
```json
[
  { "id": "a", "name": "Castle", "track": null, "is_playing": false, ... },
  { "id": "b", "name": "Deck B", "track": null, "is_playing": false, ... },
  { "id": "c", "name": "Karting", "track": null, "is_playing": false, ... },
  { "id": "d", "name": "Deck D", "track": null, "is_playing": false, ... }
]
```

#### 3.4 WebSocket Connection
```bash
# From Windows, use PowerShell with WebSocket client or browser console:
# In browser console at http://localhost:8083:
ws = new WebSocket("ws://localhost:8000/ws")
ws.onopen = () => console.log("Connected!")
ws.onmessage = (e) => console.log("Received:", e.data)
```

#### 3.5 Database Connection
```bash
# From Windows (using psql if installed):
psql -h localhost -U coco -d cocostation -c "SELECT 1"
# Or use Docker:
docker-compose exec db psql -U coco -d cocostation -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"
```

**Expected**: `3` (announcements, playlists, settings tables exist)

#### 3.6 Dashboard Access
```bash
# Open browser:
http://localhost:8083
```

**Expected**: Dashboard loads (may show login or empty state)

---

## ✅ PHASE 4: DATABASE VERIFICATION (2 min)

### Check Migrations Ran

```bash
docker-compose exec db psql -U coco -d cocostation -c "
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema='public'
  ORDER BY table_name;
"
```

**Expected Output** (all tables created):
```
           table_name           
──────────────────────────────
 announcements
 decks
 playlists
 recurring_mixer_schedules
 recurring_schedules
 settings
 music_schedules
```

### Insert Sample Data (Optional)

```bash
docker-compose exec db psql -U coco -d cocostation -c "
  INSERT INTO decks (id, name) VALUES 
    ('a', 'Castle'), 
    ('b', 'Deck B'), 
    ('c', 'Karting'), 
    ('d', 'Deck D')
  ON CONFLICT (id) DO NOTHING;
"
```

---

## ✅ PHASE 5: FULL INTEGRATION TEST (5-10 min)

### Test 5.1: Upload Audio Track

```bash
# Upload a sample MP3 (replace with your file):
curl -X POST http://localhost:8000/api/library/upload \
  -H "Authorization: Bearer test_token" \
  -F "file=@sample.mp3"
```

**Expected**:
```json
{
  "status": "ok",
  "filename": "sample.mp3",
  "size": 123456
}
```

### Test 5.2: Get Library

```bash
curl -X GET http://localhost:8000/api/library
```

**Expected**: `[{"filename": "sample.mp3", "size": 123456}]`

### Test 5.3: Create Playlist

```bash
curl -X POST http://localhost:8000/api/playlists \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Playlist",
    "tracks": ["sample.mp3"]
  }'
```

### Test 5.4: Load Playlist to Deck A

```bash
curl -X POST http://localhost:8000/api/decks/a/playlist \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{
    "playlist_id": "<playlist_id_from_step_5.3>",
    "loop": true
  }'
```

### Test 5.5: Play Deck A

```bash
curl -X POST http://localhost:8000/api/decks/a/play \
  -H "Authorization: Bearer test_token"
```

**Expected**: Deck A starts playing in MediaMTX

### Test 5.6: Create TTS Announcement

```bash
curl -X POST http://localhost:8000/api/announcements/tts \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Announcement",
    "text": "Hello this is a test announcement",
    "lang": "en",
    "targets": ["A", "B"]
  }'
```

### Test 5.7: Play Announcement

```bash
# Get announcement ID from previous step
curl -X POST http://localhost:8000/api/announcements/<ann_id>/play \
  -H "Authorization: Bearer test_token"
```

**Expected**: 
- Deck volumes duck to 5%
- Announcement plays on decks A & B
- Deck volumes restore to normal

---

## ⚠️ TROUBLESHOOTING

### Services Won't Start

```bash
# Check Docker daemon
docker ps

# Rebuild with fresh images
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### API Connection Timeout

```bash
# Check container is running
docker ps | grep api

# Check logs for errors
docker-compose logs api

# Rebuild API image
docker-compose build --no-cache api
docker-compose up -d api
```

### Database Connection Failed

```bash
# Check PostgreSQL is ready
docker-compose logs db

# Reset database
docker-compose down -v
mkdir -p data/db
docker-compose up -d db
sleep 10
docker-compose up -d api  # Will run migrations
```

### WebSocket Connection Refused

```bash
# Verify API is serving WebSocket
curl -X GET http://localhost:8000/api/health

# Check if proxy headers in nginx.conf:
# Should include:
#   proxy_http_version 1.1;
#   proxy_set_header Upgrade $http_upgrade;
#   proxy_set_header Connection "upgrade";
```

### FFmpeg Mixer Not Encoding

```bash
# Check FFmpeg installed in container
docker-compose exec ffmpeg ffmpeg -version

# Check RTMP stream reaching MediaMTX
docker-compose logs ffmpeg | grep "RTMP"
```

---

## 📊 MONITORING

### Real-time Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api -n 50  # Last 50 lines

# Follow new lines only
docker-compose logs -f --tail 0
```

### Container Stats
```bash
docker stats cocostation_api cocostation_ffmpeg cocostation_mediamtx cocostation_db cocostation_dashboard
```

### Network Check
```bash
docker network inspect cocostation_default
```

---

## 🎯 SUCCESS INDICATORS

✅ All 5 containers running (`docker ps`)  
✅ API responds to `/api/health` (HTTP 200)  
✅ FFmpeg mixer returns deck status (HTTP 200)  
✅ Dashboard loads at http://localhost:8083  
✅ WebSocket connects in browser console  
✅ Database has all tables created  
✅ Upload & playback works end-to-end  

---

## 📞 DEPLOYMENT COMPLETE

**Estimated Time**: 20-30 minutes  
**Status**: ✅ READY FOR USE

### Next Steps:
1. Access dashboard: http://localhost:8083
2. Upload first track from Library tab
3. Create first playlist
4. Test deck playback
5. Set up recurring schedules
6. Configure live streaming URLs

### Monitoring:
- API logs: `docker-compose logs -f api`
- Full logs: `docker-compose logs -f`
- Container status: `docker ps`

---

**Questions? Check PROJECT_SCAN_AND_BUILD_PLAN.md for detailed architecture.**
