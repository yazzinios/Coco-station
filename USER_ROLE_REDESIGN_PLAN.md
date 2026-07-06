# CocoStation — User & Role System Redesign Plan
## Unified DB ↔ LDAP User Model · Simplified Roles

> **Status:** Proposal (not yet implemented)
> **Replaces:** Parts of `RBAC_ARCHITECTURE.md` and `LDAP_ROLES_AND_PERMISSIONS.md` related to user identity and role resolution
> **Goal:** One clean, predictable mapping between identity (local DB or LDAP) and role, with no sync drift

---

## 1. Problem Statement

The current system treats local DB users and LDAP users as two separate identity tracks that happen to both produce a JWT:

- LDAP users are **not persisted** in the `users` table (synthetic id `ldap-{username}`), so there is no single place to look up "who is this user" regardless of login method.
- Role for LDAP users is **recomputed from `memberOf` on every login** instead of stored, so role/permission edits made by an admin in the DB can be silently overwritten the next time the user logs in.
- There is no link between a local DB user record and the LDAP identity that may also describe the same person (e.g. an admin pre-creates `alice` locally, and `alice` also exists in AD — these become two disconnected identities).
- Custom permission overrides per-user (`/api/users/{id}/effective-permissions`) only work cleanly for local users, since LDAP users may not have a row to attach overrides to.

This plan fixes that by making **every user — local or LDAP — a row in the same `users` table**, with a `source` field and a one-time/refreshable sync step instead of compute-on-every-login logic scattered across the auth flow.

---

## 2. Design Principles

1. **Single source of truth for identity.** Every authenticated user, regardless of login method, has exactly one row in `users`. No synthetic IDs.
2. **LDAP describes group membership; the DB describes role and permissions.** LDAP is never queried at request time outside of login — it's a sync trigger, not a live permission source.
3. **Sync, don't recompute.** On successful LDAP bind, CocoStation upserts the local user row and re-applies role mapping only if the user's LDAP groups changed since last login.
4. **Roles are simple and few.** Replace the 4-tier hierarchy + unlimited custom roles with a small fixed set, plus one escape hatch (per-user permission overrides) instead of unlimited custom roles.
5. **Explicit over implicit.** No silent fallback role (current system defaults unmapped users to `operator`, which is a privilege footgun). Unmapped users get `pending` and zero access until an admin assigns a role.

---

## 3. Simplified Role Model

Drop the open-ended `custom_*` role system. Replace with **3 fixed roles** plus optional per-user permission overrides for edge cases.

| Role | Description |
|------|-------------|
| `admin` | Full access: users, roles, settings, all decks, scheduling |
| `member` | Operational access: decks, library, playlists, announcements, schedules — no user/settings management |
| `viewer` | Read-only: view decks and playlists, no control |

No `super_admin` vs `admin` split, no unlimited custom roles. If a station genuinely needs a one-off permission tweak for a specific person, that's handled by **per-user permission overrides** on top of their base role, not a brand-new role.

```
admin ─── full control
  │
member ─── operate the station
  │
viewer ─── watch only

(+ pending — new/unmapped users, zero access until assigned)
```

---

## 4. Unified Data Model

### 4.1 `users` table (single identity table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Generated once, stable for life of the identity |
| `username` | text | Login name (matches LDAP `sAMAccountName`/`uid` for LDAP users). **Unique per `(username, source)` pair, not globally** — this is what allows the dual-identity case in §1 (e.g. a local `alice` and an LDAP `alice` coexisting as two separate rows until reconciled) |
| `source` | enum(`local`, `ldap`) | Where this identity authenticates |
| `password_hash` | text, nullable | Only set for `source = local` |
| `display_name` | text | From LDAP `cn`/local profile |
| `email` | text, nullable | From LDAP `mail`/local profile |
| `role` | enum(`admin`, `member`, `viewer`, `pending`) | Current effective role, stored — not recomputed live |
| `permission_overrides` | jsonb, nullable | Optional per-user deltas on top of role defaults |
| `ldap_dn` | text, nullable | Full bind DN, only for `source = ldap` |
| `ldap_groups_hash` | text, nullable | Hash of last-seen `memberOf` list, used to detect group changes |
| `is_active` | boolean | Soft-disable without deleting |
| `last_login` | timestamp | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

This **replaces** the old behavior where LDAP users had no DB row. Now `alice` (LDAP) and `bob` (local) are both just rows in `users`, distinguished by `source`.

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users ADD CONSTRAINT uq_users_username_source UNIQUE (username, source);
```

### 4.2 `ldap_group_role_map` table (replaces ad-hoc settings JSON)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | |
| `group_dn` | text, unique | Full LDAP group DN |
| `role` | enum(`admin`, `member`, `viewer`) | Role granted to members of this group |
| `priority` | int | Lower number = evaluated first; first match wins |
| `enabled` | boolean | Allows disabling a mapping without deleting it |

This replaces the scattered `ldap_role_super_admin_group` / `ldap_role_admin_group` / ... settings keys and the separate `ldap_role_custom_groups` JSON blob with one clean, queryable table.

---

## 5. Login & Sync Flow

### 5.1 Local login (unchanged in spirit)

```
POST /api/auth/login {username, password, login_method: "local"}
   → look up users WHERE username + source='local'
   → verify password_hash
   → issue JWT with role from users.role
```

### 5.2 LDAP login (new sync-based flow)

```
POST /api/auth/login {username, password, login_method: "ldap"}
   │
   ▼
1. Bind to LDAP with service account, search for username
   → get user DN, memberOf[], cn, mail
   │
   ▼
2. Bind as the user (DN + supplied password) → verifies credentials
   │
   ▼
3. Look up users WHERE username + source='ldap'
   │
   ├── Not found → CREATE new row:
   │      role = resolve_role(memberOf)   # via ldap_group_role_map
   │      if no group matches → role = 'pending'
   │      ldap_groups_hash = hash(memberOf)
   │
   └── Found →
          new_hash = hash(memberOf)
          if new_hash != stored ldap_groups_hash:
              role = resolve_role(memberOf)   # groups changed, re-resolve
              ldap_groups_hash = new_hash
          else:
              role = users.role   # unchanged — DO NOT recompute, respects admin overrides
   │
   ▼
4. Update display_name, email, last_login
   │
   ▼
5. Issue JWT with users.id, users.role, users.permission_overrides
```

**Key change from current behavior:** role is only re-derived from LDAP groups when group membership actually changes. If an admin manually changes a user's role or overrides in the DB, that sticks across logins as long as the user's LDAP groups stay the same — eliminating the "admin edit gets silently undone" problem.

### 5.3 Manual resync

Admins can force a re-resolution at any time (e.g. after editing `ldap_group_role_map`) via:

```
POST /api/users/{id}/resync-ldap     → re-binds, re-resolves role, ignores hash check
POST /api/users/resync-all-ldap      → bulk resync (admin/super job, e.g. nightly cron)
```

### 5.4 `login_method: "auto"` resolution order

`LDAP_ROLES_AND_PERMISSIONS.md` §1/§9 defines an `"auto"` mode (try LDAP first, fall back to local DB — this is how `cocoadmin` keeps working if LDAP is down). Under the two-row model this needs an explicit order, since a username can now exist as both a `source='local'` row and a `source='ldap'` row simultaneously:

```
login_method = "auto":
   1. If ldap_enabled: attempt LDAP bind flow (§5.2) first.
      → Success: use/create the source='ldap' row. Done.
      → LDAP down/unreachable (connection error, not bad credentials): fall through to step 2.
      → LDAP reachable but bind fails (bad credentials, user not found): 401, do NOT fall through
        (prevents a local row with the same username from being used to bypass LDAP auth).
   2. Local DB auth (§5.1) against the source='local' row, if one exists.
```

This preserves the `cocoadmin` guarantee (local login still works if LDAP is unreachable) while closing the gap where an LDAP outage could let someone authenticate against a same-named local account using different credentials.

---

## 6. Permission Resolution (per request)

```
effective_permissions = role_defaults[users.role]  merged with  users.permission_overrides
```

Both local and LDAP users resolve permissions identically — there is no LDAP-specific permission branch anymore. `permission_overrides` is the only escape hatch, e.g.:

```json
{
  "can_settings": false,
  "deck_actions_deny": ["deck.crossfader"]
}
```

---

## 7. Migration Plan (high level)

0. **Pre-req: consolidate auth implementation** (RBAC_ARCHITECTURE.md §18.1). `main.py` currently uses its own **inline** auth endpoints and its own `_db_get_user_by_username`, while `auth_routes.py` is a fully-written but **not-yet-integrated** refactor. The new LDAP sync flow in §5.2 must be built into whichever file is actually live — building it into the unintegrated `auth_routes.py` would have no runtime effect. Recommended order:
   - Integrate `auth_routes.py` into `main.py` per the action items already listed in RBAC_ARCHITECTURE.md §18.1 (`app.include_router(auth_router)`, remove the duplicate inline endpoints and `_db_get_user_by_username`).
   - While touching these files, fix `BUG_STATUS.md` C1 (`asyncio.get_event_loop()` crashes on Python 3.12) in both `auth_routes.py` and `rbac.py` — these are the two files most likely to host the new `resync-ldap` / `resync-all-ldap` endpoints from §8, so they shouldn't inherit a live crash bug on day one.
   - Only then build the new sync-based LDAP login logic (§5.2) on top of the consolidated auth module.
1. **Schema migration**: add `source`, `ldap_dn`, `ldap_groups_hash`, `permission_overrides` columns to `users`; create `ldap_group_role_map` table.
   - **1a. Add `last_login` column** (fixes `BUG_STATUS.md` H7 — `update_last_login` currently silently fails because this column doesn't exist in `BASE_SCHEMA_SQL`/`REPAIR_SQL`): `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;`. This must ship as part of step 1 — §4.1 and §5.2 both assume `last_login` already exists on `users`, so the redesign's login/sync flow would silently no-op on this field without it.
2. **Backfill**: existing local `users` rows get `source = 'local'`.
3. **LDAP group settings migration**: convert existing `ldap_role_*_group` settings keys + `ldap_role_custom_groups` JSON into rows in `ldap_group_role_map`, mapping old roles down to the new 3-role set (suggested default: `super_admin`→`admin`, `admin`→`admin`, `operator`→`member`, `viewer`→`viewer`, all `custom_*`→`member` pending manual review).
4. **First LDAP login after migration**: existing "virtual" `ldap-{username}` sessions don't carry over — users simply get a real row created on next login, per the flow in §5.2.
5. **Deprecate**: remove `ldap_role_custom_groups`/`ldap_role_*_group` settings keys and the unlimited custom-role table/endpoints once migration is verified.
6. **Update docs**: retire the relevant sections of `RBAC_ARCHITECTURE.md` / `LDAP_ROLES_AND_PERMISSIONS.md` in favor of this document once implemented.

---

## 8. API Surface Changes

| Endpoint | Change |
|----------|--------|
| `GET /api/users` | Now returns LDAP users too (they're real rows) |
| `POST /api/users/{id}/resync-ldap` | **New** — force re-resolve role from current LDAP groups |
| `POST /api/users/resync-all-ldap` | **New** — bulk resync, for cron or post-mapping-change |
| `GET /api/ldap-role-map` / `POST` / `PUT` / `DELETE` | **New** — CRUD for `ldap_group_role_map`, replacing the old settings-blob approach |
| `POST /api/roles` / `PUT /api/roles/{id}` / `DELETE` | **Removed** — no more dynamic custom roles |
| `POST /api/users/{id}/apply-role-template` | **Removed** — replaced by `permission_overrides` reset (`DELETE /api/users/{id}/overrides`) |

---

## 9. Open Questions for Review

- Should `pending` users be visible/loginable with a "contact your admin" message, or fully blocked at the API level?
- Do we want `permission_overrides` to support full deck-level granularity (per deck/per action) or just feature-flag-level toggles?
- Cadence for `resync-all-ldap` cron (e.g. nightly) — needed to catch group removals for users who don't log in often, since group *removal* won't be detected until their next login otherwise.
- Should disabling a `ldap_group_role_map` row demote currently-affected users immediately, or only on next sync?

---

## 10. Summary of What Changes

| Aspect | Before | After |
|--------|--------|-------|
| LDAP user identity | Synthetic `ldap-{username}`, no DB row | Real row in `users`, `source='ldap'` |
| Role storage | Recomputed from LDAP groups every login | Stored on user, re-resolved only when groups change |
| Roles available | 4 built-in + unlimited custom | 3 fixed roles + per-user overrides |
| Group mapping config | Settings keys + JSON blob | Dedicated `ldap_group_role_map` table |
| Unmapped user default | Falls back to `operator` (privileged!) | Falls back to `pending` (zero access) |
| Per-user tweaks | Custom role required | `permission_overrides` JSON on the user row |
