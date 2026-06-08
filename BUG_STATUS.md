# CocoStation — Bug Status Tracker
**Audit Date:** 2026-06-08  
**Rechecked:** 2026-06-08 (live code verified)  
**Source:** Full codebase bug report

---

## Summary

| Severity | Total | Fixed | Open |
|----------|-------|-------|------|
| 🔴 Critical | 4 | 1 | 3 |
| 🟠 High | 7 | 3 | 4 |
| 🔵 Medium | 8 | 2 | 6 |
| 🟢 Low | 4 | 0 | 4 |
| **Total** | **23** | **6** | **17** |

---

## 🔴 Critical

### C1 — `asyncio.get_event_loop()` crashes on Python 3.12
- **Files:** `auth_routes.py` (×14 calls), `rbac.py` (×8 calls)
- **Status:** ❌ NOT FIXED
- **Evidence:** `_fetch_permissions`, `login`, `refresh_token`, LDAP test/save, user-mapping endpoints, all role endpoints in `rbac.py` still use `asyncio.get_event_loop()`. Only `main.py` uses `asyncio.get_running_loop()` correctly.
- **Fix:** Replace every `asyncio.get_event_loop()` with `asyncio.get_running_loop()` in both files.

---

### C2 — DJ stream webhooks completely unauthenticated
- **Files:** `dj_routes.py` — `POST /api/dj/stream/detected`, `POST /api/dj/stream/ended`
- **Status:** ❌ NOT FIXED
- **Evidence:** Both endpoints have no `Depends(verify_token)`, no IP check, no secret header. Confirmed in current `dj_routes.py`.
- **Fix:** Add IP allowlist: `if request.client.host != "10.20.0.2": raise HTTPException(403)`. Or add a shared secret header in MediaMTX `runOnReady` curl and verify server-side.

---

### C3 — Trigger lock never released if `mic_open_sequence` raises
- **Files:** `announcement_engine.py`
- **Status:** ✅ FIXED
- **Evidence:** `mic_open_sequence` now has a proper `try/except` that calls `_TRIGGER_LOCK.release()` before re-raising on any error. Lock is safe.

---

### C4 — `LISTENER_HISTORY` lost on every container restart
- **Files:** `main.py` — `_poll_listeners` / `_record_listener`
- **Status:** ❌ NOT FIXED
- **Evidence:** `_poll_listeners` updates only `CURRENT_LISTENERS` and `PEAK_LISTENERS` (module-level ints). `_record_listener` writes to an in-memory structure with no DB persistence or startup load.
- **Fix:** On startup load from a `listener_history` DB table. Flush to DB every 5 minutes via background task. Same pattern already used for `music_requests`.

---

## 🟠 High

### H1 — `_scheduler_owner` never re-stamped on `track_ended` advances
- **Files:** `main.py` — `track_ended`, `scheduler.py` — `_trigger_recurring_mixer_schedule`
- **Status:** ⚠️ PARTIALLY MITIGATED
- **Evidence:** `_ap_stop_mixer_by_id` in `scheduler.py` now has a fallback: if `owner` is `None` but `ran_today` is true and deck is still playing, it still stops the deck. This handles the lost-owner case at stop time. However the root cause (owner not re-stamped on advance) remains — if another schedule starts on the same deck between the track advance and the stop time, the fallback will stop the wrong schedule's playback.
- **Remaining fix:** In `track_ended`, after advancing the playlist, re-stamp `DECKS[deck_id]["_scheduler_owner"]` from active scheduler context.

---

### H2 — DJ announce uses hardcoded `sleep(6)` for file playback
- **Files:** `dj_routes.py` — `dj_announce`, `_announce` inner function
- **Status:** ❌ NOT FIXED
- **Evidence:** `await asyncio.sleep(6)` is still present in the `req.file` branch. The TTS branch directly below correctly uses `_audio_dur_fn`.
- **Fix:** One line — replace `await asyncio.sleep(6)` with:
  ```python
  if _audio_dur_fn:
      duration = await _audio_dur_fn(Path(f"/announcements/{req.file}"))
      await asyncio.sleep(duration + 0.5)
  ```

---

### H3 — Duck refcount mismatch when announcement fails mid-sequence
- **Files:** `announcement_engine.py` — `play_announcement_sequence`, `main.py` — `_DUCK_REFCOUNT_REF`
- **Status:** ✅ FIXED
- **Evidence:** `main.py` now has a full `_duck_acquire` / `_duck_release` engine with refcounting. `fade_and_play_announcement` delegates to `ann_engine.play_announcement_sequence` which manages its own volumes independently. The two systems no longer interfere — `_DUCK_REFCOUNT_REF` is used only by the mic/duck engine in main.py, not by `ann_engine`. No cross-contamination possible.

---

### H4 — Redis singleton never reconnects on failure
- **Files:** `dj_redis.py` — `get_redis`
- **Status:** ❌ NOT FIXED
- **Evidence:** `get_redis()` still creates `_redis` once and reuses forever with no error handling or reset on `ConnectionError`.
- **Fix:** 
  ```python
  async def get_redis() -> aioredis.Redis:
      global _redis
      if _redis is None:
          _redis = aioredis.from_url(REDIS_URL, decode_responses=True,
                                     retry_on_error=[aioredis.exceptions.ConnectionError])
      return _redis
  ```

---

### H5 — TTS files accumulate forever, no cleanup
- **Files:** `tts.py`, `main.py` — `delete_announcement`
- **Status:** ❌ NOT FIXED
- **Evidence:** `tts.py` generates `tts_<uuid>.mp3` with no deletion path. No startup sweep or delete-time cleanup found in `main.py`.
- **Fix:** In `delete_announcement` endpoint, add: `if ann.get("type") == "TTS" and ann.get("file_path"): (ANNOUNCEMENTS_DIR / ann["file_path"]).unlink(missing_ok=True)`. Also add a startup sweep removing orphaned `tts_*.mp3` files not referenced in DB.

---

### H6 — Heartbeat runs before `_state` fully initialized
- **Files:** `scheduler.py`
- **Status:** ✅ FIXED
- **Evidence:** All `_state` accesses in heartbeat and oneoff checker use `.get(key, [])`. `init_scheduler` is called before `start_scheduler` in lifespan. Safe.

---

### H7 — `update_last_login` silently fails — `last_login` column missing
- **Files:** `db_auth_helpers.py`, `migrate.py`
- **Status:** ❌ NOT FIXED
- **Evidence:** `migrate.py` `BASE_SCHEMA_SQL` users table has no `last_login` column. `REPAIR_SQL` block does not add it. Every login call to `update_last_login` fails silently.
- **Fix:** Add to `REPAIR_SQL` in `migrate.py`:
  ```sql
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='users' AND column_name='last_login') THEN
      ALTER TABLE users ADD COLUMN last_login TIMESTAMP WITH TIME ZONE;
  END IF;
  ```

---

## 🔵 Medium

### M1 — `model_post_init` Pydantic hook
- **Files:** `schemas.py`
- **Status:** ✅ WORKS — Pydantic v2 confirmed, `model_post_init` fires correctly. `stop_time = ""` is coerced to `None`.

---

### M2 — DJ deck RESERVED TTL (120s) too short
- **Files:** `dj_redis.py` — `RESERVE_TTL = 120`
- **Status:** ❌ NOT FIXED
- **Fix:** Change `RESERVE_TTL = 120` to `RESERVE_TTL = 300`.

---

### M3 — One-off announcement can fire twice across restarts
- **Files:** `scheduler.py` — `_ap_check_oneoffs`
- **Status:** ❌ NOT FIXED
- **Fix:** Write `status = "Played"` to DB synchronously before firing the play task, not after.

---

### M4 — TTS path hardcoded to `/app/data/announcements`
- **Files:** `tts.py` — line 3
- **Status:** ❌ NOT FIXED
- **Evidence:** `TTS_DIR = "/app/data/announcements"` — hardcoded, breaks local dev.
- **Fix:** `TTS_DIR = os.getenv("ANNOUNCEMENTS_DIR", "/app/data/announcements")`

---

### M5 — Deck F missing from DB seed
- **Files:** `migrate.py` — `BASE_SCHEMA_SQL`, `deck_names` INSERT, `REPAIR_SQL`
- **Status:** ❌ NOT FIXED
- **Evidence:** Both `INSERT INTO decks` and `INSERT INTO deck_names` only seed `a`–`e`. Deck F exists at runtime but not in DB.
- **Fix:** Add to both INSERT blocks and to `REPAIR_SQL`:
  ```sql
  -- decks seed:
  ('f', 'Deck F', 100, false)
  -- deck_names seed:
  ('f', 'Deck F')
  -- REPAIR_SQL:
  INSERT INTO decks (id, name, volume, is_playing) VALUES ('f','Deck F',100,false) ON CONFLICT (id) DO NOTHING;
  INSERT INTO deck_names (deck_id, name) VALUES ('f','Deck F') ON CONFLICT (deck_id) DO NOTHING;
  ```

---

### M6 — `multi_tracks` silently dropped in recurring schedule creation
- **Files:** `schemas.py`, `main.py` — `create_recurring_schedule`, `update_recurring_schedule`
- **Status:** ❌ NOT FIXED
- **Fix:** Add `"multi_tracks": req.multi_tracks` to the schedule dict in both create and update handlers.

---

### M7 — AppContext WS reconnect fires after logout
- **Files:** `dashboard/src/context/AppContext.jsx`
- **Status:** ❌ NOT FIXED
- **Fix:** Add a module-level `_loggingOut` flag that `connectWS` checks before opening. Or move WS close into `useEffect` cleanup only.

---

### M8 — `_play_content` sends play command for missing files
- **Files:** `announcement_engine.py` — `_play_content`
- **Status:** ⚠️ PARTIALLY FIXED
- **What's fixed:** Timeout is now smart — actual duration + 10s grace instead of always 70s.
- **Still broken:** If the file doesn't exist, the play command is still sent and the engine still waits up to 70s.
- **Remaining fix:** Add before sending the play command:
  ```python
  if not local_path.exists():
      print(f"[engine] Content file not found, skipping: {local_path}")
      return
  ```

---

## 🟢 Low / Polish

### L1 — `DeckState` schema missing `is_crossfading`
- **Files:** `schemas.py` — `DeckState`
- **Status:** ❌ NOT FIXED
- **Fix:** Add `is_crossfading: bool = False` to `DeckState`.

---

### L2 — Announcement duration not cached
- **Files:** `announcement_engine.py` — `get_audio_duration`
- **Status:** ❌ NOT FIXED
- **Fix:** Add module-level `_duration_cache: Dict[str, float] = {}`. Cache by `filepath + str(mtime)`, invalidate on mtime change.

---

### L3 — Heartbeat logs misleading "in 23h 45m" after schedule ran
- **Files:** `scheduler.py` — `_ap_heartbeat`
- **Status:** ❌ NOT FIXED
- **Fix:** Skip "upcoming" entry for schedules whose `last_run_date == today_str`, or append "(ran today)".

---

### L4 — Library file endpoint ignores Range headers
- **Files:** `main.py` — `GET /api/library/file/{filename}`
- **Status:** ❌ NOT FIXED
- **Fix:** Ensure `FileResponse` uses the correct `media_type` per file extension rather than always `"audio/mpeg"`. FastAPI's `FileResponse` supports Range natively when media type is correct.

---

## Files Removed from Root

| File | Reason |
|------|--------|
| `CREDENTIALS.md` | 🔒 Security risk — contained plaintext credentials. Moved to `_trash/` — delete manually. |
| `DECK_E_PLAN.md` | Stale — Deck E fully implemented |
| `jingle_path_fix_plan.md` | Stale — fix already applied |
| `PROJECT_SCAN_AND_BUILD_PLAN.md` | Outdated build plan from April 2026 |
| `DOCUMENTATION_INDEX.md` | Redundant |
| `README_SUMMARY.md` | Outdated summary |

> ⚠️ All moved to `_trash/` folder. **Delete `CREDENTIALS.md` immediately** — it contains plaintext passwords.
