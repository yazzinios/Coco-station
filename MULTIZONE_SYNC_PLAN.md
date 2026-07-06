# Multi-Zone Sync & Calibration — Implementation Plan

**Status:** Planned. Builds on the `/announce/sync` grouped-release mechanism
already implemented in `deck_manager.py` / `announcement_engine.py`.
**Scope expanded** from "announcements only" to "any time the same audio is
meant to land in multiple zones at once" (playlist broadcast, sync-all,
recurring mixer schedules, and announcements).

---

## 1. Problem

Software-side trigger skew (ffmpeg subprocess spawn/codec init jitter) is
already solved. What's left is skew introduced **downstream of the mixer**
— each zone's path to the listener's ear is a different length:

- fiber run to that zone's media converter/decoder
- that decoder's own processing chain (DSP, amp)
- physical distance from speaker to listener (~1 ms per 34 cm of air)

This is a fixed, per-zone constant. It doesn't change announcement to
announcement, so it shouldn't be re-detected every time — it should be
measured/calibrated once per zone and applied automatically afterward.

## 2. Scope: not just announcements

Anywhere this codebase currently starts the *same* audio on multiple decks
at *once*, it has the same skew problem `/announce/sync` fixed for
announcements. The same fix needs to apply to:

| Call site | File | Current behavior |
|---|---|---|
| Announcements/jingles | `announcement_engine.py` | ✅ Already fixed via `/announce/sync` |
| Playlist Broadcast | `main.py` → `playlist_broadcast()` | ❌ Fires independent `/play` per deck via `asyncio.gather` — same skew risk |
| Sync-All | `main.py` → `sync_all_to_source()` | ⚠️ Compensates for *elapsed position* via `sync_probe`, but not for each deck's *physical* offset on top of that |
| Deck Clone | `main.py` → `clone_deck()` | ⚠️ Same as Sync-All — position-synced, not physically-offset-corrected |
| Recurring Mixer Schedules (multi-deck) | `scheduler.py` | ❌ Needs checking — likely loops per deck independently, same risk |

**Note:** decks normally play *different* content per zone (that's the
whole point of having six independent decks). The physical-offset
correction only matters for the subset of operations above, where the
intent is explicitly "the same audio, multiple zones, at once." It should
not apply to a deck's normal independent playback.

Plan: generalize the mixer's grouped-release primitive so it isn't
announcement-specific, and route all four call sites through it.

## 3. Synchronization modes

Three modes, in increasing order of effort/hardware dependency:

### Manual (ship first — buildable today, no new hardware)
Admin enters a fixed millisecond offset per deck by ear, using a test-tone
tool. Sign convention: **positive = this zone's downstream path is slower**
→ release it earlier by that amount.

### Automatic (Phase 2 — depends on your zone hardware)
The server periodically measures network latency to each zone and
auto-fills the "transport" portion of the offset.

**This one comes with a hard dependency I can't resolve from the code
alone: does each zone's media converter/decoder have an IP address the API
server can reach and get a timely response from (ping, or a small HTTP
endpoint on the device)?**
- If yes → simple timestamp echo (server sends timestamp, device echoes
  it back, RTT/2 ≈ one-way network delay), sampled every N seconds,
  averaged to absorb jitter.
- If the zone boxes are "dumb" appliances with no IP presence at all
  (e.g. plain HDMI/analog decoders fed by a media converter with no
  management interface), there is nothing to probe — automatic mode isn't
  possible without adding a small probe agent (e.g. a $10 Pi Zero / ESP32
  at each zone) purely for this measurement. Worth confirming what's
  actually out there before promising this mode.

### Hybrid (recommended once Automatic is viable)
```
Total Delay = Auto-measured network delay  +  Manual downstream offset
```
Network/transport delay is auto-measured (Mode 2); everything after that
point — DSP, amplifier, converter, speaker distance — is entered manually,
because none of that is measurable without a microphone (see §7). This is
realistic to build incrementally: ship Manual now, layer Automatic on top
later without throwing away any of the manual numbers (they become the
"downstream" component instead of the whole offset).

## 4. Data model

Extend the `deck_sync_offsets_ms` idea into a small structured table
instead of a flat number, so Hybrid mode has somewhere to put both parts.
Lives in `SETTINGS` (`api/main.py`), persisted via the existing
`db.save_settings`/`db.get_settings` — no new DB table.

```python
"sync": {
    "enabled": True,
    "mode": "manual",          # "manual" | "automatic" | "hybrid"
    "tolerance_ms": 20,        # informational — flagged in monitoring if exceeded
    "preload_buffer_ms": 0,    # reserved for Phase 2+ if pre-buffering is added
    "safety_margin_ms": 50,    # matches the existing 0.05s anchor buffer in deck_manager.py
    "countdown_ms": 0,         # optional pre-roll before a synced group release
    "wait_for_all_ready": True,
    "missing_deck_timeout_s": 2.0,   # matches the existing 2.0s deadline in /announce/sync
    "continue_if_offline": True,
},
"deck_offsets": {
    "a": {"manual_ms": 0,   "auto_ms": 0, "name": "Main Entrance"},
    "b": {"manual_ms": 65,  "auto_ms": 0, "name": "Roller Coaster"},
    "c": {"manual_ms": 120, "auto_ms": 0, "name": "Pirate Ship"},
    "d": {"manual_ms": 95,  "auto_ms": 0, "name": "Food Court"},
    "e": {"manual_ms": 0,   "auto_ms": 0},
    "f": {"manual_ms": 0,   "auto_ms": 0},
},
"sync_profiles": {
    "Normal Operation": { /* snapshot of deck_offsets */ },
    "Event Mode":       { /* ... */ },
},
"active_sync_profile": "Normal Operation",
```

Effective offset per deck = `manual_ms + auto_ms` (auto_ms stays `0` until
Automatic/Hybrid mode is actually built and running). Clamp combined value
to **±1000 ms** server-side on save.

## 5. Mixer: generalize the grouped-release primitive

`deck_manager.py` currently has `/announce/sync` (announcement-specific).
Generalize the underlying mechanism so it can release **plain track
playback** in sync too, for playlist broadcast / sync-all / recurring
schedules:

```python
class SyncPlayRequest(BaseModel):
    deck_ids: List[str]
    filepath: str            # or per-deck filepaths, see below
    loop: bool = False
    seek_seconds: Dict[str, float] = {}   # per-deck — sync-all already computes this
    offsets_ms: Dict[str, int] = {}

@app.post("/play/sync")
def play_sync_group(req: SyncPlayRequest):
    # same ready_event / anchor+offset release logic as /announce/sync,
    # but calling deck.play(...) instead of deck.play_announcement(...)
    ...
```

The anchor + per-deck-offset release logic (`anchor = now + safety_margin`,
`release_at[deck] = anchor - offset_ms[deck]`) is identical to what
`/announce/sync` already does — this is mostly extracting that logic into
a shared helper both endpoints call, rather than writing it twice.

`Deck.play()` needs the same optional `ready_event`/`release_at` gating
that `play_announcement()` got — wrap the `subprocess.Popen` + reader
thread the same way.

## 6. API: wire offsets into every group-start call site

- `announcement_engine.py` — already updated to read
  `_SETTINGS.get("deck_sync_offsets_ms", {})`; update the key path to
  `_SETTINGS["deck_offsets"]` (manual_ms + auto_ms) once §4 lands.
- `main.py` → `playlist_broadcast()` — replace the per-deck `asyncio.gather`
  of `/decks/{id}/play` calls with one `/play/sync` call carrying all
  target `deck_ids` + current offsets.
- `main.py` → `sync_all_to_source()` / `clone_deck()` — combine the
  *existing* `sync_probe`-derived `seek_to` (position alignment) with the
  *new* physical offset (timing alignment) — both apply, they solve
  different problems. Pass both into `/play/sync`.
- `scheduler.py` — check how multi-deck recurring mixer schedules currently
  fire each deck; route through `/play/sync` if it's doing independent
  per-deck calls today.

## 7. Calibration tooling

Numbers are useless without a fast feedback loop — this is the part that
actually gets used day-to-day.

**Test Tone** — `POST /api/settings/sync/test-tone`. Generates a short
click on the fly (`ffmpeg -f lavfi -i "sine=frequency=1000:duration=0.3"`,
cached after first generation) and fires it through `/play/sync` (or
`/announce/sync`) on whichever decks you pick, using offsets you haven't
saved yet — so you can hear the effect of a slider move before committing.

**Pulse Generator** — same tone, repeating on an interval (e.g. every 1s)
until stopped, for standing at a zone boundary and tuning by ear in real
time rather than click-test-click-test.

**Calibration Wizard (Automatic/Hybrid only, Phase 2)** —
1. "Measure All Decks" → runs the network timestamp-echo probe (§3) against
   every zone that's reachable.
2. Shows raw measured delay per deck.
3. Computes relative offsets against whichever deck measured slowest
   (`offset[d] = max(measured) - measured[d]`).
4. "Apply Offsets" writes the result into `auto_ms` for each deck — your
   `manual_ms` entries (DSP/amp/speaker-distance numbers) are untouched and
   simply add on top.

## 8. Acoustic calibration (optional, Phase 3 — needs new hardware)

The most accurate method, and the only one that captures *everything*
(fiber + converter + DSP + amp + speaker + air): play a pulse, record it
with a microphone placed near that zone's speaker, measure actual arrival
time. This requires a mic input somewhere in the loop (USB mic on the
server, or a phone running a small companion page that captures audio and
posts the timestamp back) — not buildable from the existing stack alone.
Flagging as a future option rather than committing to it now.

## 9. Monitoring

A small per-deck table, refreshed periodically (reuse the polling pattern
`_poll_listeners()` already uses in `main.py`):

```
Deck          Network   Manual    Total     Jitter   Status
Entrance      —         0 ms      0 ms      —        🟢 (manual mode: network not measured)
Roller Coast. 21 ms     65 ms     86 ms     2 ms     🟢
Pirate Ship   78 ms     120 ms    198 ms    9 ms     🟡 (> tolerance_ms)
```
Status thresholds reuse `sync.tolerance_ms` from §4 (e.g. 🟢 within
tolerance, 🟡 within 3× tolerance, 🔴 beyond that). In Manual mode,
"Network" stays blank/dash since nothing is being measured yet.

## 10. Calibration profiles

Named snapshots of `deck_offsets`, switchable from Settings — useful if
speaker placement changes between e.g. normal days and special events.
Save / Load / Duplicate / Delete on top of the `sync_profiles` map in §4.
No new mechanism needed beyond reading/writing that dict.

## 11. Settings UI structure

```
Settings
└── Audio Distribution
    ├── Synchronization   (mode, tolerance, margins, countdown, missing-deck handling)
    ├── Deck Delays        (manual_ms per deck — the table you'll touch most)
    ├── Calibration         (test tone, pulse generator, calibration wizard)
    ├── Monitoring          (live delay/jitter table)
    └── Profiles            (save / load / duplicate / delete named presets)
```

## 12. Implementation phases

**Phase 1 — Manual mode + generalized primitive** (no new hardware,
everything buildable on top of what exists today)
1. `SETTINGS["sync"]` + `SETTINGS["deck_offsets"]` defaults, clamp on save.
2. Extract `/announce/sync`'s anchor+offset release logic into a shared
   helper; add `/play/sync` for plain track playback.
3. Add `ready_event`/`release_at` gating to `Deck.play()` (mirrors what
   `play_announcement()` already has).
4. Route `playlist_broadcast`, `sync_all_to_source`, `clone_deck` through
   `/play/sync` with current offsets.
5. Test-tone + pulse-generator endpoints.
6. Dashboard: Deck Delays table + Calibration test-tone button. (Minimum
   viable UI — Monitoring/Profiles can follow.)

**Phase 2 — Automatic / Hybrid** (contingent on §3's open question)
7. Network timestamp-echo probe against reachable zone hardware.
8. Calibration Wizard ("Measure All Decks" → "Apply Offsets").
9. Monitoring table wired to live probe data.

**Phase 3 — Profiles, drift correction, alerting** (polish, no urgency)
10. Named profile save/load/duplicate/delete.
11. Periodic re-measurement + drift alerts if `tolerance_ms` exceeded.
12. Sync event logging (reuses existing `db.log_action` audit pattern).

**Phase 4 — Acoustic calibration** (optional, needs mic hardware — not
scheduled, listed for completeness only).

## 13. Open questions before starting Phase 2+

1. **Do the zone decoders/media converters have a reachable IP and any
   way to respond to a timing probe** (ping, or a tiny HTTP endpoint)?
   This determines whether Automatic/Hybrid mode is buildable as designed
   or needs a probe-agent add-on per zone.
2. Brand/model of the media converters or decoder boxes at each zone, if
   known — affects what's actually possible to query.
3. Confirm scope: is synchronized start needed for **continuous background
   music mirrored across zones** (e.g. Playlist Broadcast / Sync-All use
   cases), or mainly for announcements/jingles that get pushed to multiple
   zones at once? Affects how aggressively to generalize §5–6.

## 14. Validation checklist

- [ ] Manual mode: trigger synced test tone on two adjacent zones at
      offset 0 — confirm audible echo (baseline).
- [ ] Adjust one zone's `manual_ms` and retest — echo should shrink/disappear.
- [ ] Save settings, restart `api` container, retrigger — offsets persist
      without re-tuning.
- [ ] Playlist Broadcast to multiple decks starts in sync (not just
      announcements).
- [ ] Sync-All / Clone Deck still lands on the correct elapsed position
      *and* now also respects physical offsets.
- [ ] Regular independent deck playback (different content per zone) is
      completely unaffected by any non-zero offset values.
- [ ] (Phase 2) Network probe returns stable, repeatable measurements
      across multiple samples before trusting auto-calculated offsets.
