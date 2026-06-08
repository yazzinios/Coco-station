# Deck E — Implementation Plan

> **Scope:** Add a fifth audio deck (`e`) to CocoStation with full feature parity to Decks A–D.
> Every layer of the stack must be touched. This document is the single source of truth — work through each phase in order.

---

## What "full feature parity" means

Deck E must support everything the existing decks do:

| Feature | Where it lives |
|---|---|
| FFmpeg RTMP master stream → MediaMTX | `ffmpeg-mixer/deck_manager.py` |
| Play / Pause / Resume / Stop / Loop | `deck_manager.py` + `api/main.py` |
| Volume control + duck/restore | `api/main.py` + `deck_manager.py` |
| Announcement & jingle overlay | `deck_manager.py` |
| Mic ducking target | `deck_manager.py` + `api/main.py` |
| WebSocket state broadcast | `api/main.py` |
| Playlist loading, next/prev, auto-advance | `api/main.py` + `DECK_PLAYLISTS` dict |
| Music & recurring schedules as a target | `api/main.py` (validation guards) |
| RBAC — allowed_decks, deck_control | `api/rbac.py` |
| Per-role default permissions | `api/rbac.py` — `DECK_IDS`, `SYSTEM_ROLES` |
| DB — deck name persistence | `api/db_client.py` |
| MediaMTX stream path `deck-e` | `mediamtx/mediamtx.yml` |
| Frontend DeckPanel color + monitor | `dashboard/src/components/DeckPanel.jsx` |
| Frontend MixerPage layout | `dashboard/src/pages/MixerPage.jsx` |
| Listeners API summary | `api/main.py` `/api/listeners` |
| DB migration — seed deck_names row | `api/migrations/014_add_deck_e.sql` |

---

## Phase 1 — FFmpeg Mixer (`ffmpeg-mixer/deck_manager.py`)

### 1.1 Add deck `e` to the `decks` dict

```python
# BEFORE
decks: dict = {name: Deck(name) for name in ["a", "b", "c", "d"]}

# AFTER
decks: dict = {name: Deck(name) for name in ["a", "b", "c", "d", "e"]}
```

That single change starts the RTMP master stream `rtmp://mediamtx:1935/deck-e` and creates all mixer/reader threads automatically — the `Deck` class is generic.

### 1.2 Update mic `ALL` target expansion

Two places in `deck_manager.py` expand `"ALL"` to a hardcoded list:

```python
# mic_stream_start  — line ~255
target_ids = ["a","b","c","d"] if (not raw_targets or "ALL" in raw_targets) else ...

# _mic_reader closure — line ~278
for did in target_ids:
```

Change both to:

```python
target_ids = ["a","b","c","d","e"] if (not raw_targets or "ALL" in raw_targets) else ...
```

---

## Phase 2 — API (`api/main.py`)

### 2.1 Add deck `e` to `DECKS`

```python
DECKS: Dict[str, dict] = {
    "a": {"id": "a", "name": "Castle",  ...},
    "b": {"id": "b", "name": "Deck B",  ...},
    "c": {"id": "c", "name": "Karting", ...},
    "d": {"id": "d", "name": "Deck D",  ...},
    "e": {"id": "e", "name": "Deck E",  "track": None, "volume": 100,   # ← ADD
           "is_playing": False, "is_paused": False, "is_loop": False,
           "playlist_id": None, "playlist_index": None, "playlist_loop": False},
}
```

### 2.2 Add deck `e` to `DECK_PLAYLISTS`

```python
DECK_PLAYLISTS: Dict[str, Optional[dict]] = {"a": None, "b": None, "c": None, "d": None, "e": None}
```

### 2.3 Update all `"ALL"` mic target expansions (4 occurrences)

Search for every `["a","b","c","d"]` hardcoded list used as fallback for `"ALL"` targets and replace with `["a","b","c","d","e"]`.

Affected locations:
- `/api/mic/on` handler
- `/api/mic/off` handler  
- `/ws/mic` websocket — `mic_start` branch
- `/ws/mic` websocket — `mic_stop` branch and `finally` block

### 2.4 Update `/api/listeners` summary

```python
for deck_id in ["deck-a", "deck-b", "deck-c", "deck-d", "deck-e"]:  # ← add deck-e
```

### 2.5 Update `/api/stats` playing-decks count

No change needed — it uses `DECKS.values()` dynamically.

---

## Phase 3 — RBAC (`api/rbac.py`)

### 3.1 Add `"e"` to `DECK_IDS`

```python
# BEFORE
DECK_IDS = ["a", "b", "c", "d"]

# AFTER
DECK_IDS = ["a", "b", "c", "d", "e"]
```

This single change propagates `"e"` into:
- `_full_deck_control()` — generates `{"e": {"view": True, "control": True}, ...}` for all system roles
- All `SYSTEM_ROLES` entries — `default_allowed_decks`, `default_deck_control`
- `_role_to_perms()` fallback
- `_superadmin_effective()`
- `/api/permissions/catalogue` response

No other changes needed in `rbac.py`.

---

## Phase 4 — DB Migration (`api/migrations/014_add_deck_e.sql`)

Create the file:

```sql
-- 014_add_deck_e.sql
-- Ensures deck E has a persisted name row in deck_names.
-- Safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING).

INSERT INTO deck_names (deck_id, name)
VALUES ('e', 'Deck E')
ON CONFLICT (deck_id) DO NOTHING;
```

### 4.1 Register the migration in `migrate.py`

Open `api/migrate.py` and add `"014_add_deck_e.sql"` to the ordered migrations list (however the existing migrations are registered — typically a sorted glob or explicit list).

---

## Phase 5 — MediaMTX (`mediamtx/mediamtx.yml`)

Add the `deck-e` path alongside the existing `deck-a` through `deck-d` entries:

```yaml
paths:
  deck-a:
    ...
  deck-b:
    ...
  deck-c:
    ...
  deck-d:
    ...
  deck-e:          # ← ADD — copy exact same config as deck-d
    source: publisher
    sourceOnDemand: yes
    readUser: ""
    readPass: ""
```

> Exact key names depend on your MediaMTX version. Copy the block from `deck-d` verbatim and change only the path name.

---

## Phase 6 — Frontend DeckPanel (`dashboard/src/components/DeckPanel.jsx`)

### 6.1 Add a color theme for deck `e`

```js
const DECK_COLORS = {
  a: { accent: '#00d4ff', glow: 'rgba(0,212,255,0.3)'   },
  b: { accent: '#a55eea', glow: 'rgba(165,94,234,0.3)'  },
  c: { accent: '#26de81', glow: 'rgba(38,222,129,0.3)'  },
  d: { accent: '#fd9644', glow: 'rgba(253,150,68,0.3)'  },
  e: { accent: '#ff6b9d', glow: 'rgba(255,107,157,0.3)' },  // ← ADD (pink/rose)
};
```

> Color choice is yours — the `|| DECK_COLORS.a` fallback at the bottom of `DeckPanel` means it won't crash without this, but the explicit entry gives it its own identity.

No other changes needed in `DeckPanel.jsx` — it is fully generic on `id`.

---

## Phase 7 — Frontend MixerPage (`dashboard/src/pages/MixerPage.jsx`)

Find where the four `<DeckPanel>` components are rendered and add a fifth:

```jsx
{/* BEFORE */}
<DeckPanel id="a" />
<DeckPanel id="b" />
<DeckPanel id="c" />
<DeckPanel id="d" />

{/* AFTER */}
<DeckPanel id="a" />
<DeckPanel id="b" />
<DeckPanel id="c" />
<DeckPanel id="d" />
<DeckPanel id="e" />
```

Check whether the deck grid uses a hardcoded 4-column layout (CSS `grid-template-columns: repeat(4, 1fr)` or similar) and update it to accommodate 5 panels. Suggested responsive approach:

```css
grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
```

Or keep 4 columns and let the 5th wrap to a second row — either is acceptable.

---

## Phase 8 — AppContext / API client (`dashboard/src/context/AppContext.jsx`)

Search for any hardcoded `["a","b","c","d"]` deck lists used for:
- Initial state hydration
- Deck permission checks (`canViewDeck`, `canControlDeck`)
- WebSocket state merging

Replace each with `["a","b","c","d","e"]` or — better — make them dynamic by reading the deck list from the WebSocket `FULL_STATE` payload (`decks` array) rather than a static constant.

---

## Phase 9 — UsersPage permissions UI (`dashboard/src/pages/UsersPage.jsx`)

The permissions modal renders a checkbox/toggle for each deck in `DECK_IDS`. Since that list is fetched from `/api/permissions/catalogue` (which will now include `"e"` after Phase 3), **no frontend change is needed** — the UI is already data-driven.

Verify by checking that `UsersPage` maps over `catalogue.deck_ids` and not a hardcoded array.

---

## Phase 10 — Announcement Engine (`api/announcement_engine.py`)

Search for any hardcoded deck list (e.g. `["a","b","c","d"]`) used when:
- Resolving `"ALL"` targets in announcement playback
- Building per-deck `asyncio.Event` objects in `_ANNOUNCEMENT_EVENTS`

Replace with `["a","b","c","d","e"]` or make it dynamic from the `DECKS` dict passed at `init()`.

---

## Phase 11 — Scheduler (`api/scheduler.py`)

Search for hardcoded deck lists in:
- Schedule validation (checking `deck_id in valid_decks`)
- `"ALL"` target expansion in triggered schedules

Update to include `"e"`.

---

## Testing checklist

After all changes, rebuild and restart containers, then verify:

- [ ] `GET /health` on port 8001 (mixer) shows `"e"` in `decks`
- [ ] `GET /api/decks` shows deck `e` with `id: "e"`
- [ ] MediaMTX path `deck-e` appears in `GET http://mediamtx:9997/v3/paths/list`
- [ ] RTSP stream `rtsp://<host>:8554/deck-e` plays in VLC after loading a track
- [ ] HLS stream `http://<host>/deck-e/index.m3u8` plays in browser monitor
- [ ] Play / Pause / Stop / Volume / Loop all work on deck E
- [ ] Playlist loads and auto-advances on deck E
- [ ] Announcement ducking affects deck E when it is playing
- [ ] Mic `"ALL"` target includes deck E (check mixer logs)
- [ ] Deck E appears in the Users permission modal under "Deck Access"
- [ ] Deck name can be renamed and persists across restart
- [ ] `GET /api/permissions/catalogue` includes `"e"` in `deck_ids`
- [ ] Existing decks A–D are completely unaffected

---

## Files modified summary

| File | Change type |
|---|---|
| `ffmpeg-mixer/deck_manager.py` | Add `"e"` to deck init list; update 2× `"ALL"` expansions |
| `api/main.py` | Add deck E to `DECKS` + `DECK_PLAYLISTS`; update 5× `"ALL"` lists; update listeners |
| `api/rbac.py` | Add `"e"` to `DECK_IDS` |
| `api/migrations/014_add_deck_e.sql` | New file — seed `deck_names` row |
| `api/migrate.py` | Register migration 014 |
| `api/announcement_engine.py` | Update `"ALL"` deck expansions |
| `api/scheduler.py` | Update deck validation + `"ALL"` expansions |
| `mediamtx/mediamtx.yml` | Add `deck-e` path block |
| `dashboard/src/components/DeckPanel.jsx` | Add color theme for `e` |
| `dashboard/src/pages/MixerPage.jsx` | Add `<DeckPanel id="e" />`; update grid layout |
| `dashboard/src/context/AppContext.jsx` | Update any hardcoded `["a","b","c","d"]` deck lists |

---

## Commit strategy

```
feat(deck-e): add fifth audio deck with full feature parity

- deck_manager.py: initialise Deck('e') → RTMP stream deck-e
- main.py: add DECKS['e'], DECK_PLAYLISTS['e'], update ALL-target
  expansions (mic, announcements, listeners endpoint)
- rbac.py: add 'e' to DECK_IDS → propagates to all role defaults,
  permission catalogue, and superadmin effective perms
- migrations/014_add_deck_e.sql: seed deck_names row for deck E
- mediamtx.yml: add deck-e path
- DeckPanel.jsx: add rose/pink colour theme for deck e
- MixerPage.jsx: render <DeckPanel id="e" />, update grid layout
- AppContext.jsx: include 'e' in static deck lists
```
