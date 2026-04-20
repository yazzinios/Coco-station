# CocoStation — RBAC Architecture
## Role-Based Access Control · Deck & Feature Permissions · Audit System

> **System:** CocoStation Broadcast Management  
> **Stack:** FastAPI · PostgreSQL · React  
> **Version:** 1.1  
> **Last Updated:** 2026-04-18

---

## Table of Contents

1. [Overview](#1-overview)
2. [Role System](#2-role-system)
3. [Permission Model](#3-permission-model)
4. [Database Schema](#4-database-schema)
5. [API Endpoints](#5-api-endpoints)
6. [Authentication Flow](#6-authentication-flow)
7. [Backend Middleware](#7-backend-middleware)
8. [Frontend Permission System](#8-frontend-permission-system)
9. [UI Behavior Rules](#9-ui-behavior-rules)
10. [Audit & Activity Tracking](#10-audit--activity-tracking)
11. [Security Considerations](#11-security-considerations)
12. [Multi-Studio Architecture](#12-multi-studio-architecture)
13. [Permission Decision Tree](#13-permission-decision-tree)
14. [TTS Module](#14-tts-module)
15. [Scheduler Engine](#15-scheduler-engine)
16. [Extended API Surface](#16-extended-api-surface)
17. [Session Management](#17-session-management)
18. [Known Gaps & Pending Refactors](#18-known-gaps--pending-refactors)

---

## 1. Overview

CocoStation uses a layered RBAC system with three tiers of access control:

```
┌─────────────────────────────────────────────────────────┐
│                    ACCESS CONTROL TIERS                  │
│                                                         │
│  Tier 1 → ROLE          (super_admin / admin / operator) │
│  Tier 2 → FEATURE FLAGS (can_library / can_schedule …)  │
│  Tier 3 → DECK + ACTION (deck A: view=true, control=true)│
└─────────────────────────────────────────────────────────┘
```

Every API request and every UI element is evaluated against all three tiers. Higher tiers override lower ones — a super_admin bypasses all checks.

---

## 2. Role System

### 2.1 Built-in Roles

| Role | Badge | Description | Modifiable |
|------|-------|-------------|-----------|
| `super_admin` | ⭐ Gold | Full unrestricted access to everything | ❌ System |
| `admin` | 🛡 Orange | Manage users & content. No system settings | ❌ System |
| `operator` | 🎛 Blue | Full deck control. No user management | ❌ System |
| `viewer` | 👁 Gray | Read-only. See decks, cannot control | ❌ System |
| `custom_*` | 🔧 Any | Fully configurable by super_admin | ✅ Custom |

### 2.2 Default Permission Matrix

| Permission | super_admin | admin | operator | viewer | custom |
|------------|:-----------:|:-----:|:--------:|:------:|:------:|
| Deck View  | ✅ All | ✅ All | ✅ All | ✅ All | ⚙️ |
| Deck Control | ✅ All | ✅ All | ✅ All | ❌ | ⚙️ |
| deck.play / pause / stop | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| deck.volume / crossfader | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| deck.load_track | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| playlist.view | ✅ | ✅ | ✅ | ✅ | ⚙️ |
| playlist.create/edit | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| playlist.delete | ✅ | ✅ | ❌ | ❌ | ⚙️ |
| Library access | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| Announcements | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| Schedules | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| Settings | ✅ | ❌ | ❌ | ❌ | ⚙️ |
| User management | ✅ | ✅ | ❌ | ❌ | ⚙️ |
| Role management | ✅ | ❌ | ❌ | ❌ | ⚙️ |

`⚙️` = configurable per custom role definition

### 2.3 Role Hierarchy

```
super_admin
    └── admin
            └── operator
                    └── viewer
                              └── (custom roles can be placed at any level)
```

---

## 3. Permission Model

### 3.1 Permission Categories

```
permissions/
├── deck_control          # Per-deck view & control flags
│   ├── deck_a: { view: bool, control: bool }
│   ├── deck_b: { view: bool, control: bool }
│   ├── deck_c: { view: bool, control: bool }
│   └── deck_d: { view: bool, control: bool }
│
├── deck_actions          # Allowed actions on any deck
│   ├── deck.play
│   ├── deck.pause
│   ├── deck.stop
│   ├── deck.next
│   ├── deck.previous
│   ├── deck.volume
│   ├── deck.crossfader
│   ├── deck.load_track
│   └── deck.load_playlist
│
├── playlist_perms        # Playlist-level permissions
│   ├── playlist.view
│   ├── playlist.load
│   ├── playlist.create
│   ├── playlist.edit
│   └── playlist.delete
│
└── feature_flags         # Page/feature access
    ├── can_library
    ├── can_announce
    ├── can_schedule
    ├── can_requests
    └── can_settings
```

### 3.2 Permission Resolution Order

```
Request arrives
      │
      ▼
Is is_super_admin?  ──YES──► Allow everything
      │
      NO
      ▼
Is role == "admin"? ──YES──► Allow most things, block system settings
      │
      NO
      ▼
Check feature_flags (can_library, can_schedule, …)
      │
      ▼
Check deck_control[deck_id] → { view, control }
      │
      ▼
Check deck_actions list (deck.play, deck.pause, …)
      │
      ▼
Check playlist_perms list
      │
      ▼
Decision: ALLOW or 403 Forbidden
```

### 3.3 User Permissions vs Role Defaults

Each user has **their own permission record** in the database. At creation time, the role's defaults are copied into the user record. These can then be individually overridden — e.g. an operator who only controls Deck A.

```
Role: operator (default)
  └── allowed_decks: [A, B, C, D]
  └── can_library: true

User: john_op (overridden)
  └── allowed_decks: [A]        ← only Deck A
  └── can_library: false         ← library hidden
  └── deck_actions: [deck.play, deck.pause]  ← limited controls
```

---

## 4. Database Schema

### 4.1 Entity Relationship Diagram

```
users ──────────────────── user_permissions
  │                              │
  │ (role FK)                    │
  ▼                              ▼
roles ─────────────── role_default_permissions
  │
  └── (system flag: is_system = true/false)

users ──── audit_logs
  │
  └── (tracks all actions with IP, timestamp, details)
```

### 4.2 Table: `users`

```sql
CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username         VARCHAR(64)  NOT NULL UNIQUE,
  display_name     VARCHAR(128),
  password_hash    TEXT,                        -- NULL for LDAP users
  role             VARCHAR(64)  NOT NULL DEFAULT 'operator',
  is_super_admin   BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  source           VARCHAR(16)  NOT NULL DEFAULT 'local', -- 'local' | 'ldap'
  email            VARCHAR(256),
  last_login       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_role FOREIGN KEY (role) REFERENCES roles(name) ON UPDATE CASCADE
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role     ON users(role);
```

### 4.3 Table: `roles`

```sql
CREATE TABLE roles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(50)  NOT NULL UNIQUE,  -- e.g. "operator"
  display_name            VARCHAR(100) NOT NULL,
  description             TEXT,
  color                   VARCHAR(20)  DEFAULT '#6B7280',
  is_system               BOOLEAN      NOT NULL DEFAULT FALSE,

  -- Default permissions for users assigned this role
  default_allowed_decks   JSONB        DEFAULT '["a","b","c","d"]',
  default_deck_control    JSONB        DEFAULT '{"a":{"view":true,"control":true},...}',
  default_deck_actions    JSONB        DEFAULT '["deck.play","deck.pause",...]',
  default_playlist_perms  JSONB        DEFAULT '["playlist.view","playlist.load"]',
  default_can_announce    BOOLEAN      DEFAULT TRUE,
  default_can_schedule    BOOLEAN      DEFAULT TRUE,
  default_can_library     BOOLEAN      DEFAULT TRUE,
  default_can_requests    BOOLEAN      DEFAULT TRUE,
  default_can_settings    BOOLEAN      DEFAULT FALSE,

  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### 4.4 Table: `user_permissions`

```sql
CREATE TABLE user_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Deck access
  allowed_decks   JSONB  DEFAULT '["a","b","c","d"]',
  deck_control    JSONB  DEFAULT '{
                    "a": {"view": true, "control": true},
                    "b": {"view": true, "control": true},
                    "c": {"view": true, "control": true},
                    "d": {"view": true, "control": true}
                  }',

  -- Action permissions
  deck_actions    JSONB  DEFAULT '["deck.play","deck.pause","deck.stop",
                                   "deck.next","deck.previous","deck.volume",
                                   "deck.crossfader","deck.load_track","deck.load_playlist"]',

  -- Playlist permissions
  playlist_perms  JSONB  DEFAULT '["playlist.view","playlist.load"]',

  -- Feature flags
  can_announce    BOOLEAN DEFAULT TRUE,
  can_schedule    BOOLEAN DEFAULT TRUE,
  can_library     BOOLEAN DEFAULT TRUE,
  can_requests    BOOLEAN DEFAULT TRUE,
  can_settings    BOOLEAN DEFAULT FALSE,

  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_permissions UNIQUE (user_id)
);

CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
```

### 4.5 Table: `audit_logs`

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  username    VARCHAR(64),
  action      VARCHAR(128) NOT NULL,   -- e.g. "user.create", "deck.play"
  details     JSONB        DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user      ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action    ON audit_logs(action);
CREATE INDEX idx_audit_logs_created   ON audit_logs(created_at DESC);
```

### 4.6 Table: `studios` *(multi-studio)*

```sql
CREATE TABLE studios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(128) NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Studio-specific user access (future expansion)
CREATE TABLE studio_access (
  studio_id   UUID REFERENCES studios(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id)   ON DELETE CASCADE,
  role        VARCHAR(64),
  PRIMARY KEY (studio_id, user_id)
);
```

---

## 5. API Endpoints

### 5.1 Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | ❌ Public | Login → returns JWT + user + permissions |
| `POST` | `/api/auth/refresh` | ✅ Bearer | Refresh expiring token |
| `POST` | `/api/auth/logout` | ✅ Bearer | Invalidate session (client-side) |
| `GET`  | `/api/auth/me` | ✅ Bearer | Get current user + permissions |

**Login response shape:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in_hours": 8,
  "user": {
    "id": "uuid",
    "username": "john_op",
    "display_name": "John Operator",
    "role": "operator",
    "is_super_admin": false,
    "permissions": {
      "allowed_decks": ["a", "b"],
      "deck_control": {
        "a": { "view": true, "control": true },
        "b": { "view": true, "control": false }
      },
      "deck_actions": ["deck.play", "deck.pause", "deck.volume"],
      "playlist_perms": ["playlist.view", "playlist.load"],
      "can_announce": true,
      "can_schedule": true,
      "can_library": false,
      "can_requests": true,
      "can_settings": false
    }
  }
}
```

### 5.2 User Management

| Method | Endpoint | Required Role | Description |
|--------|----------|---------------|-------------|
| `GET`    | `/api/users` | admin | List all users |
| `POST`   | `/api/users` | admin | Create user (basic) |
| `POST`   | `/api/users/extended` | admin | Create user with full permission config |
| `GET`    | `/api/users/{id}` | admin or self | Get user detail |
| `PUT`    | `/api/users/{id}` | admin | Update user info |
| `DELETE` | `/api/users/{id}` | super_admin | Delete user |
| `PUT`    | `/api/users/{id}/activate` | admin | Enable/disable user |
| `PUT`    | `/api/users/{id}/password` | admin or self | Change password |
| `GET`    | `/api/users/{id}/permissions` | admin or self | Get permissions |
| `PUT`    | `/api/users/{id}/permissions` | admin | Update permissions |
| `POST`   | `/api/users/{id}/apply-role-template` | admin | Reset to role defaults |
| `GET`    | `/api/users/{id}/effective-permissions` | admin or self | Merged effective perms |

### 5.3 Role Management

| Method | Endpoint | Required Role | Description |
|--------|----------|---------------|-------------|
| `GET`    | `/api/roles` | any authenticated | List all roles |
| `GET`    | `/api/roles/{id}` | any authenticated | Get role detail |
| `POST`   | `/api/roles` | admin | Create custom role |
| `PUT`    | `/api/roles/{id}` | admin | Update role defaults |
| `DELETE` | `/api/roles/{id}` | super_admin | Delete custom role |
| `GET`    | `/api/permissions/catalogue` | any authenticated | All known permission keys |

### 5.4 Deck Endpoints (permission-protected)

| Method | Endpoint | Required Permission | Description |
|--------|----------|--------------------|-------------|
| `GET`    | `/api/decks` | view on any deck | List decks |
| `POST`   | `/api/decks/{id}/play` | `deck.play` + control on deck | Play |
| `POST`   | `/api/decks/{id}/pause` | `deck.pause` + control on deck | Pause |
| `POST`   | `/api/decks/{id}/stop` | `deck.stop` + control on deck | Stop |
| `POST`   | `/api/decks/{id}/next` | `deck.next` + control on deck | Next track |
| `POST`   | `/api/decks/{id}/previous` | `deck.previous` + control on deck | Prev track |
| `POST`   | `/api/decks/{id}/volume` | `deck.volume` + control on deck | Set volume |
| `POST`   | `/api/decks/{id}/load` | `deck.load_track` + control on deck | Load track |
| `POST`   | `/api/decks/{id}/playlist` | `deck.load_playlist` + control | Load playlist |

### 5.5 Audit Logs

| Method | Endpoint | Required Role | Description |
|--------|----------|---------------|-------------|
| `GET` | `/api/logs` | admin | Get audit log (paginated) |
| `GET` | `/api/logs?user_id={id}` | admin | Filter by user |
| `GET` | `/api/logs?action={action}` | admin | Filter by action type |

> For the full extended API surface (library, announcements, schedules, mic, jingles, WebSocket), see **Section 16**.

---

## 6. Authentication Flow

### 6.1 Login Sequence

```
Browser                     FastAPI                   PostgreSQL
   │                           │                           │
   │  POST /api/auth/login     │                           │
   │  { username, password }   │                           │
   │──────────────────────────►│                           │
   │                           │  SELECT user WHERE        │
   │                           │  username = ?             │
   │                           │──────────────────────────►│
   │                           │◄──────────────────────────│
   │                           │  { user row }             │
   │                           │                           │
   │                           │  bcrypt.verify(password)  │
   │                           │  ──── if LDAP: ldap3 ───  │
   │                           │                           │
   │                           │  SELECT permissions       │
   │                           │  WHERE user_id = ?        │
   │                           │──────────────────────────►│
   │                           │◄──────────────────────────│
   │                           │  { permissions row }      │
   │                           │                           │
   │                           │  jwt.encode({             │
   │                           │    sub, username, role,   │
   │                           │    is_super_admin, exp    │
   │                           │  })                       │
   │                           │                           │
   │◄──────────────────────────│                           │
   │  { access_token, user,    │                           │
   │    permissions }          │                           │
   │                           │                           │
   │  localStorage:            │                           │
   │  coco_token = JWT         │                           │
   │  coco_user  = user JSON   │                           │
   │  coco_permissions = perms │                           │
```

### 6.2 Authenticated Request Sequence

```
Browser                     FastAPI                   PostgreSQL
   │                           │                           │
   │  GET /api/decks/a/play    │                           │
   │  Authorization: Bearer JWT│                           │
   │──────────────────────────►│                           │
   │                           │  jwt.decode(token)        │
   │                           │  → { sub, role, exp }     │
   │                           │                           │
   │                           │  is_super_admin?          │
   │                           │  ──YES──► allow           │
   │                           │                           │
   │                           │  NO: check deck_control   │
   │                           │  for deck_id "a"          │
   │                           │──────────────────────────►│
   │                           │◄──────────────────────────│
   │                           │  { control: true }        │
   │                           │                           │
   │                           │  check deck_actions has   │
   │                           │  "deck.play"?             │
   │                           │  ──YES──► execute         │
   │                           │                           │
   │◄──────────────────────────│                           │
   │  200 OK                   │                           │
```

### 6.3 JWT Payload Structure

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "username": "john_op",
  "role": "operator",
  "is_super_admin": false,
  "exp": 1713484800,
  "iat": 1713456000
}
```

> Permissions are **NOT** stored in the JWT — they are loaded from the DB on each privileged request. This ensures revoked permissions take effect immediately without requiring a re-login.

---

## 7. Backend Middleware

### 7.1 Dependency Chain (FastAPI)

```python
# ── Level 1: Token validation (all protected routes) ──────────────
verify_token(credentials)
  → jwt.decode()
  → returns user dict { sub, username, role, is_super_admin }

# ── Level 2: Role requirements ────────────────────────────────────
require_admin  = Depends(verify_token) + role check
require_super_admin = Depends(verify_token) + is_super_admin check
require_role("operator", "admin") = factory + Depends(verify_token)

# ── Level 3: Permission requirements ──────────────────────────────
require_permission("deck.play")
  → verify_token
  → if elevated: allow
  → else: load permissions from DB → check deck_actions list

# ── Level 4: Deck-level access ────────────────────────────────────
require_deck_access(level="control")
  → verify_token
  → if elevated: allow
  → else: load permissions → check deck_control[deck_id].control
```

### 7.2 Middleware Stack Order

```
Request
  │
  ▼
[CORS Middleware]
  │
  ▼
[Rate Limiter] (future)
  │
  ▼
[HTTPBearer — extract JWT]
  │
  ▼
[verify_token — decode & validate JWT]
  │
  ▼
[Role / Permission Dependency — per-route]
  │
  ▼
[Route Handler]
  │
  ▼
[Audit Logger — async, post-response]
  │
  ▼
Response
```

### 7.3 Audit Logging Pattern

```python
# Every mutating action logs:
db.log_action(
    user_id  = user["sub"],
    username = user["username"],
    action   = "deck.play",          # namespaced action
    details  = { "deck_id": "a" },   # contextual details
    ip       = request.client.host,
)

# Action naming convention:
# user.create / user.update / user.delete / user.disable
# role.create / role.update / role.delete
# deck.play / deck.stop / deck.volume
# library.upload / library.delete
# announcement.play / announcement.create
# settings.update / settings.ldap_save
```

---

## 8. Frontend Permission System

### 8.1 Context Architecture

```
AppContext
  ├── currentUser      — logged-in user object
  ├── userPermissions  — full permissions object (from /api/users/{id}/permissions)
  ├── isElevated       — shortcut: role === "admin" || is_super_admin
  │
  ├── hasPermission(perm)          — check deck_actions / playlist_perms
  ├── hasFeature(feature)          — check can_library, can_settings, etc.
  ├── canViewDeck(deckId)          — check deck_control[id].view
  ├── canControlDeck(deckId)       — check deck_control[id].control
  │
  ├── login(user)     — set currentUser + permissions
  └── logout()        — clear localStorage + state
```

### 8.2 Component Layers

```
App.jsx
  └── ProtectedLayout          ← shows LoginPage if not authenticated
        └── AppLayout
              ├── SessionGuard ← JWT expiry watcher (warn at 5min, auto-logout at 0)
              ├── Sidebar      ← filters nav items via hasFeature()
              └── Routes
                    ├── /           MixerPage       (always visible)
                    ├── /library    ProtectedRoute(feature="can_library")
                    ├── /announce   ProtectedRoute(feature="can_announce")
                    ├── /schedules  ProtectedRoute(feature="can_schedule")
                    ├── /requests   ProtectedRoute(feature="can_requests")
                    ├── /stats      StatisticsPage  (always visible)
                    ├── /settings   ProtectedRoute(feature="can_settings")
                    └── /users      ProtectedRoute(elevated)
```

### 8.3 Component: `PermissionGate`

```jsx
// Hide UI element if no permission
<PermissionGate perm="deck.play">
  <PlayButton />
</PermissionGate>

// Show locked fallback instead of hiding
<PermissionGate perm="deck.volume" fallback={<LockedSlider />}>
  <VolumeSlider />
</PermissionGate>

// Feature flag
<PermissionGate feature="can_settings">
  <SettingsPanel />
</PermissionGate>

// Deck-level
<PermissionGate deck="a" level="control">
  <DeckControlRow />
</PermissionGate>

// Admin-only section
<PermissionGate elevated>
  <UserManagementTable />
</PermissionGate>
```

### 8.4 Hook: `usePermission`

```js
const {
  can,           // can("deck.play") → bool
  canDeck,       // canDeck("a", "control") → bool
  hasFeature,    // hasFeature("can_library") → bool
  isElevated,    // admin or super_admin → bool
  role,          // "operator" | "admin" | "super_admin" | null
  isSuperAdmin,  // bool
  isAdmin,       // bool
  isLoggedIn,    // bool
} = usePermission();
```

---

## 9. UI Behavior Rules

### 9.1 Permission → UI Mapping

| Situation | UI Behavior |
|-----------|-------------|
| No `deck.play` permission | Play button hidden |
| Has view but no control on Deck B | Deck B visible, all buttons disabled + 🔒 |
| No `can_library` feature | Library tab hidden from sidebar |
| No `can_settings` feature | Settings tab hidden; direct URL → Access Denied screen |
| Viewer role on all decks | Decks visible but all controls locked |
| Admin | Users tab visible in sidebar |
| super_admin | All pages, all controls, all buttons |

### 9.2 Lock Icon Behavior

```
Condition: user can VIEW deck but NOT CONTROL it
  → Deck panel renders in "view mode"
  → All control buttons replaced with 🔒 icon
  → Volume slider: read-only (no drag)
  → Track name visible, time visible
  → Clicking any locked control: shows toast "You don't have control access for Deck B"
```

### 9.3 Access Denied Screen

```
Triggered by: ProtectedRoute when permission check fails
Displays:
  ┌──────────────────────────┐
  │    🛡 (shield icon)       │
  │    Access Denied          │
  │    This area requires     │
  │    [Role Name] access.    │
  │                           │
  │  Contact your admin       │
  │  to request access.       │
  └──────────────────────────┘
```

---

## 10. Audit & Activity Tracking

### 10.1 Tracked Events

```
Category: AUTH
  auth.login          — successful login (IP, username)
  auth.login_failed   — failed attempt (IP, username tried)
  auth.logout         — explicit logout

Category: USER
  user.create         — new user created (by whom, role assigned)
  user.update         — fields changed
  user.delete         — user deleted
  user.disable        — account deactivated
  user.enable         — account re-activated
  user.password_change — password updated (by self or admin)
  user.apply_role_template — permissions reset to role defaults

Category: ROLE
  role.create         — custom role created
  role.update         — role defaults updated
  role.delete         — custom role deleted

Category: PERMISSIONS
  permissions.update  — user's permissions modified manually

Category: DECK
  deck.play / pause / stop / next / previous
  deck.volume         — value logged
  deck.load_track     — track filename logged
  deck.load_playlist  — playlist id logged

Category: LIBRARY
  library.upload      — filename, size
  library.delete      — filename

Category: SETTINGS
  settings.update     — keys changed (not values for security)
  settings.ldap_save  — LDAP config updated
```

### 10.2 Log Entry Structure

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "username": "john_op",
  "action": "deck.play",
  "details": {
    "deck_id": "a",
    "track": "morning_show_intro.mp3"
  },
  "ip_address": "192.168.1.45",
  "created_at": "2026-04-18T09:15:32Z"
}
```

### 10.3 Log Retention

- Logs are retained indefinitely (no auto-purge).
- Admins can filter by user, action, date range.
- Super admins can export logs as CSV (future feature).

---

## 11. Security Considerations

### 11.1 Token Security

| Setting | Value |
|---------|-------|
| Algorithm | HS256 |
| Expiry | Configurable via `session_hours` setting (default: 8 hours) |
| Secret rotation | Via `JWT_SECRET` env var (requires re-login) |
| Storage | `localStorage` (client-side) |
| Transport | HTTPS only in production |
| Revocation | Stateless — change JWT_SECRET to invalidate all sessions |

### 11.2 Password Security

```
Hashing:  bcrypt (cost factor 12)
Min length: 6 characters (enforce 8+ in production)
Admin reset: admin can set new password without knowing old one
Self-change: user must supply current password
LDAP users: no local password stored (password_hash = NULL)
```

### 11.3 Permission Checks: Defense in Depth

```
Layer 1 — Frontend:    PermissionGate hides UI elements
Layer 2 — Frontend:    ProtectedRoute blocks page access
Layer 3 — Backend:     FastAPI Depends() on every endpoint
Layer 4 — Backend:     DB-level permission load per request (for operators)
Layer 5 — Audit Log:   Every mutation recorded with actor + IP
```

> **Critical:** Frontend checks are UX only. Backend always re-validates. Removing a UI element does NOT remove API access.

### 11.4 Admin Constraints

```
Rules:
  ✅ Admins can create operators and viewers
  ✅ Admins can modify operator/viewer permissions
  ✅ Admins can disable/enable non-admin users
  ❌ Admins CANNOT create other admins or super_admins
  ❌ Admins CANNOT delete any user (super_admin only)
  ❌ Admins CANNOT access system settings page
  ❌ Admins CANNOT delete system roles
  ❌ Admins CANNOT modify another admin's permissions

Super Admin only:
  ✅ Create/delete admins
  ✅ Delete users
  ✅ Delete roles (non-system)
  ✅ Access all settings
  ✅ View all audit logs
```

---

## 12. Multi-Studio Architecture

### 12.1 Studio Isolation (Future)

```
Studio: Castle          Studio: Karting
  ├── Deck A              ├── Deck C
  ├── Deck B              └── Deck D
  ├── Library A           ├── Library K
  └── Users: [op1, op2]  └── Users: [op3]

Shared:
  └── super_admin (cross-studio access)
  └── Announcements (optional: shared or per-studio)
```

### 12.2 Studio-Scoped Permissions (Extension)

```sql
-- Per-studio role assignment
INSERT INTO studio_access (studio_id, user_id, role) VALUES
  ('castle-uuid', 'user-uuid', 'operator');

-- User can be operator in Castle, viewer in Karting
```

### 12.3 Current Implementation

Currently Deck A and Deck C are named "Castle" and "Karting" — the multi-studio groundwork is in the deck naming system. Full studio isolation is ready to be added as a schema extension without breaking existing permissions.

---

## 13. Permission Decision Tree

```
                       ┌───────────────────┐
                       │  Incoming Request  │
                       └────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │ JWT present & valid?  │
                    └───────────┬──────────┘
                         NO ◄───┘   YES
                          │          │
                    401   │    ┌─────▼──────────────┐
                          │    │   is_super_admin?   │
                          │    └─────┬──────────────┘
                          │    YES ◄─┘   NO
                          │     │         │
                          │  ALLOW   ┌────▼──────────────────┐
                          │          │  Role check required?  │
                          │          │  (require_admin etc.)  │
                          │          └────┬──────────────────┘
                          │          YES ◄┘   NO ──► next check
                          │           │
                          │    ┌──────▼──────────┐
                          │    │  role == admin?  │
                          │    └──────┬──────────┘
                          │      YES ◄┘   NO
                          │       │         │
                          │    ALLOW       403
                          │
                          │   Feature check?
                          │    ┌────▼──────────────────┐
                          │    │  user_permissions      │
                          │    │  .can_library == true? │
                          │    └────┬──────────────────┘
                          │     YES │   NO
                          │         │     └──► 403
                          │
                          │   Deck check?
                          │    ┌────▼──────────────────────┐
                          │    │  deck_control[id].control? │
                          │    └────┬──────────────────────┘
                          │     YES │   NO
                          │         │     └──► 403
                          │
                          │   Action check?
                          │    ┌────▼────────────────────────┐
                          │    │  "deck.play" in deck_actions? │
                          │    └────┬────────────────────────┘
                          │     YES │   NO
                          │   ALLOW │     └──► 403
                          │
                       [Audit Log Written]
                          │
                       Response
```

---

## 14. TTS Module

### 14.1 Overview

`tts.py` provides text-to-speech generation using **Microsoft Edge TTS** (`edge-tts` library). It runs asynchronously inside FastAPI's event loop and outputs MP3 files to `/app/data/announcements/`.

### 14.2 Supported Languages & Voices

| Code | Language | Voice |
|------|----------|-------|
| `en` | English (US) | en-US-AriaNeural |
| `fr` | French | fr-FR-DeniseNeural |
| `ar` | Arabic (Saudi) | ar-SA-ZariyahNeural |
| `es` | Spanish | es-ES-ElviraNeural |
| `de` | German | de-DE-KatjaNeural |
| `it` | Italian | it-IT-ElsaNeural |
| `ma` | Moroccan Arabic (Darija) | ar-MA-MounaNeural |

### 14.3 Usage

```python
from tts import generate_tts

# Called with await inside an async FastAPI route
filepath = await generate_tts(text="Bonjour tout le monde", lang="fr")
# Returns: "/app/data/announcements/tts_<uuid>.mp3"
```

### 14.4 TTS Request Schema

```python
class TTSRequest(BaseModel):
    name: str                      # display name for the announcement
    text: str                      # text to synthesize
    targets: List[str]             # deck IDs to play on, e.g. ["a", "c"]
    lang: str = "en"               # language code (see table above)
    scheduled_at: Optional[str]    # ISO datetime — if set, schedules instead of plays immediately
```

### 14.5 Integration Notes

- TTS files are stored alongside MP3 uploads in `/app/data/announcements/`.
- Filenames are UUID-based (`tts_<uuid>.mp3`) — no collision risk.
- TTS announcements participate in the same **audio ducking** system as regular announcements: music volume fades down on target decks before the announcement plays.
- Do NOT call `generate_tts` via `asyncio.run()` inside a running FastAPI event loop — use `await` directly or `loop.run_in_executor` only for sync wrappers.

---

## 15. Scheduler Engine

### 15.1 Overview

`scheduler.py` is the centralised APScheduler engine (~37 KB). It is the sole owner of all scheduled playback logic. `main.py` calls `init_scheduler(state)` at startup and never touches APScheduler directly.

### 15.2 Architecture

```
main.py
  └── lifespan()
        └── init_scheduler(state)   ← binds shared state into scheduler
        └── start_scheduler(...)    ← registers all cron jobs + pollers

scheduler.py
  ├── ap_scheduler                  ← AsyncIOScheduler (singleton)
  ├── Pollers (10s IntervalTrigger)
  │   ├── _poll_music_schedules()   ← one-off music schedules
  │   └── _poll_announcements()     ← one-off announcement schedules
  ├── CronTrigger jobs (registered dynamically)
  │   ├── recurring announcement / mic jobs
  │   └── recurring mixer jobs (multi-deck music)
  └── 60s heartbeat logger
```

### 15.3 Timezone

All cron jobs fire in **Africa/Casablanca** time (`ZoneInfo("Africa/Casablanca")`). The scheduler uses a custom `_now()` helper to always return local time, ensuring the container's UTC system clock doesn't cause timing errors.

### 15.4 Schedule Types

| Type | Trigger | Description |
|------|---------|-------------|
| One-off Music Schedule | Polled every 10s | Plays a track or playlist on a specific deck at a set datetime |
| One-off Announcement | Polled every 10s | Plays a TTS or MP3 announcement at a set datetime |
| Recurring Announcement/Mic | CronTrigger (HH:MM) | Daily/weekly announcement or mic-on sequence with ducking, jingles |
| Recurring Mixer Schedule | CronTrigger (HH:MM) | Daily/weekly music/playlist playback on one or more decks with fade |

### 15.5 Recurring Schedule Schema

```python
class RecurringScheduleCreateRequest(BaseModel):
    name: str
    type: str                        # 'Announcement' | 'Microphone'
    announcement_id: Optional[str]
    start_time: str                  # "HH:MM"
    active_days: List[int]           # [0..6] where 0=Monday
    excluded_days: List[str]         # ["YYYY-MM-DD", ...]
    fade_duration: int = 5           # seconds to duck music
    music_volume: int = 10           # duck target (% of original)
    target_decks: List[str]          # ["a", "c"]
    jingle_start: Optional[str]      # chimes filename played before
    jingle_end: Optional[str]        # chimes filename played after
    multi_tracks: List[str] = []     # extra tracks to play in sequence
    enabled: bool = True
```

### 15.6 Recurring Mixer Schedule Schema

```python
class RecurringMixerScheduleCreateRequest(BaseModel):
    name: str
    type: str                        # 'track' | 'playlist'
    target_id: str                   # filename or playlist UUID
    deck_ids: List[str]              # one or more decks simultaneously
    start_time: str                  # "HH:MM"
    active_days: List[int]
    excluded_days: List[str] = []
    fade_in: int = 3                 # fade-in seconds
    fade_out: int = 3                # fade-out seconds
    volume: int = 80
    loop: bool = True
    jingle_start: Optional[str]
    jingle_end: Optional[str]
    multi_tracks: List[str] = []
    enabled: bool = True
```

### 15.7 Shared State Keys

`init_scheduler(state)` requires these keys in the state dict:

| Key | Type | Description |
|-----|------|-------------|
| `decks` | `Dict[str, dict]` | Live deck state |
| `deck_playlists` | `Dict[str, Optional[dict]]` | Currently loaded playlist per deck |
| `announcements` | `List[dict]` | Loaded announcements |
| `music_schedules` | `List[dict]` | One-off music schedules |
| `recurring_schedules` | `List[dict]` | Recurring announcement/mic schedules |
| `recurring_mixer_schedules` | `List[dict]` | Recurring mixer schedules |
| `playlists` | `Dict[str, dict]` | All playlists keyed by UUID |
| `settings` | `dict` | Global settings (ducking, timezone, etc.) |
| `manager` | `ConnectionManager` | WebSocket broadcaster |
| `ffmpeg_url` | `str` | FFmpeg mixer service URL |
| `fade_and_play_announcement` | coroutine fn | Announcement playback with ducking |
| `mic_on` | coroutine fn | Mic-on sequence |
| `db` | `DBClient` | Database client |
| `trigger_lock_ref` | `List[asyncio.Lock]` | Mutable lock wrapper |
| `duck_refcount_ref` | `List[int]` | Active duck count |
| `duck_saved_volumes` | `Dict[str, int]` | Saved pre-duck volumes |

---

## 16. Extended API Surface

The following endpoints exist in `main.py` but were not covered in Section 5.

### 16.1 WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /ws` | Real-time broadcast — deck state, settings, announcements, schedule updates |

All mutating API operations broadcast a `{"type": "...", ...}` event to all connected WebSocket clients after completing.

### 16.2 Library

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/library` | ✅ Bearer | List all tracks (filename, size, duration) |
| `POST` | `/api/library/upload` | ✅ Bearer | Upload MP3/WAV/OGG file |
| `DELETE` | `/api/library/{filename}` | ✅ Bearer | Delete a track |
| `GET` | `/api/library/{filename}` | ✅ Bearer | Stream / download a track |

### 16.3 Announcements

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/announcements` | ✅ Bearer | List all announcements |
| `POST` | `/api/announcements/tts` | ✅ Bearer | Create TTS announcement |
| `POST` | `/api/announcements/upload` | ✅ Bearer | Upload MP3 announcement |
| `PUT` | `/api/announcements/{id}` | ✅ Bearer | Update announcement metadata |
| `DELETE` | `/api/announcements/{id}` | ✅ Bearer | Delete announcement |
| `POST` | `/api/announcements/{id}/play` | ✅ Bearer | Play announcement immediately |

### 16.4 One-Off Schedules (Music)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/schedules/music` | ✅ Bearer | List one-off music schedules |
| `POST` | `/api/schedules/music` | ✅ Bearer | Create one-off music schedule |
| `DELETE` | `/api/schedules/music/{id}` | ✅ Bearer | Delete music schedule |

### 16.5 Recurring Schedules

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/schedules/recurring` | ✅ Bearer | List recurring announcement/mic schedules |
| `POST` | `/api/schedules/recurring` | ✅ Bearer | Create recurring schedule |
| `PUT` | `/api/schedules/recurring/{id}` | ✅ Bearer | Update recurring schedule |
| `DELETE` | `/api/schedules/recurring/{id}` | ✅ Bearer | Delete recurring schedule |
| `GET` | `/api/schedules/recurring/mixer` | ✅ Bearer | List recurring mixer schedules |
| `POST` | `/api/schedules/recurring/mixer` | ✅ Bearer | Create recurring mixer schedule |
| `PUT` | `/api/schedules/recurring/mixer/{id}` | ✅ Bearer | Update recurring mixer schedule |
| `DELETE` | `/api/schedules/recurring/mixer/{id}` | ✅ Bearer | Delete recurring mixer schedule |
| `GET` | `/api/schedules/status` | ✅ Bearer | APScheduler live job status |

### 16.6 Playlists

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/playlists` | ✅ Bearer | List all playlists |
| `POST` | `/api/playlists` | ✅ Bearer | Create playlist |
| `PUT` | `/api/playlists/{id}` | ✅ Bearer | Update playlist tracks/name |
| `DELETE` | `/api/playlists/{id}` | ✅ Bearer | Delete playlist |

### 16.7 Microphone Control

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/mic/on` | ✅ Bearer | Start mic (ducks music on targets) |
| `POST` | `/api/mic/off` | ✅ Bearer | Stop mic (restore music volumes) |
| `GET` | `/api/mic/state` | ✅ Bearer | Current mic state |

### 16.8 Global Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/settings` | ✅ Bearer | Get all settings |
| `PUT` | `/api/settings/{key}` | ✅ Bearer (admin) | Update a setting value |
| `POST` | `/api/settings/ldap/test` | ✅ Bearer (admin) | Test LDAP connection |
| `POST` | `/api/settings/ldap/save` | ✅ Bearer (admin) | Save LDAP configuration |
| `GET` | `/api/settings/jingles/status` | ✅ Bearer | Check intro/outro jingle files |
| `POST` | `/api/settings/jingles/{type}/upload` | ✅ Bearer | Upload intro or outro jingle |
| `DELETE` | `/api/settings/jingles/{type}` | ✅ Bearer | Remove a jingle |

### 16.9 Global Settings Object

The `SETTINGS` dict persisted in the DB contains these keys:

| Key | Default | Description |
|-----|---------|-------------|
| `ducking_percent` | `5` | Volume % when announcement ducks music |
| `mic_ducking_percent` | `5` | Volume % when mic ducks music |
| `on_air_beep` | `"default"` | Beep sound for on-air trigger |
| `on_air_chime_enabled` | `false` | Play chime on on-air start |
| `jingle_intro` | `null` | Global intro jingle filename (`/data/chimes/`) |
| `jingle_outro` | `null` | Global outro jingle filename (`/data/chimes/`) |
| `timezone` | `"Africa/Casablanca"` | Scheduler timezone |
| `session_hours` | `8` | JWT expiry in hours |
| `ldap_enabled` | `false` | Enable LDAP authentication |
| `ldap_server` | `""` | LDAP server hostname |
| `ldap_port` | `389` | LDAP port |
| `ldap_base_dn` | `""` | LDAP search base DN |
| `ldap_bind_dn` | `""` | LDAP service account DN |
| `ldap_bind_pw` | `""` | LDAP service account password |
| `ldap_user_filter` | `"(sAMAccountName={username})"` | LDAP user search filter |
| `ldap_attr_name` | `"cn"` | LDAP display name attribute |
| `ldap_attr_email` | `"mail"` | LDAP email attribute |
| `ldap_role_admin_group` | `""` | LDAP group DN that maps to admin role |
| `ldap_use_ssl` | `false` | Use LDAPS |
| `ldap_tls_verify` | `true` | Verify TLS certificate |

### 16.10 Music Requests

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/requests` | ✅ Bearer | List submitted music requests |
| `POST` | `/api/requests` | ❌ Public | Submit a music request |
| `DELETE` | `/api/requests/{id}` | ✅ Bearer | Dismiss a request |

### 16.11 Statistics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/stats` | ✅ Bearer | Uptime, tracks played, active decks |

---

## 17. Session Management

### 17.1 SessionGuard Component

`SessionGuard.jsx` wraps the entire app layout and monitors JWT expiry in real time.

```
Behaviour:
  ┌─────────────────────────────────────────────────────┐
  │  Every 30 seconds: decode JWT from localStorage     │
  │  Calculate msLeft = exp - Date.now()                │
  │                                                     │
  │  msLeft > 5 min  → no UI shown                      │
  │  msLeft ≤ 5 min  → warning banner (amber)           │
  │  msLeft ≤ 1 min  → warning banner (red)             │
  │  msLeft ≤ 0      → auto-logout + redirect to /login │
  └─────────────────────────────────────────────────────┘
```

### 17.2 "Stay Signed In" Flow

```
User clicks "Stay signed in"
  │
  ▼
POST /api/auth/refresh (Bearer: current token)
  │
  ▼
Server validates token (not yet expired)
  │
  ▼
Issues new token with fresh exp
  │
  ▼
localStorage updated: coco_token = new JWT
SessionGuard resets countdown
```

### 17.3 Session Duration

Controlled by the `session_hours` setting (default: 8). Changeable in Settings page by admins. Takes effect on next login or token refresh.

---

## 18. Known Gaps & Pending Refactors

### 18.1 `auth_routes.py` — Not Yet Integrated

`auth_routes.py` is a fully-written refactor that moves auth endpoints into a FastAPI `APIRouter`, separates LDAP helpers, and uses `db_auth_helpers.py`. However, `main.py` still uses its own **inline** auth endpoints and its own `_db_get_user_by_username` function (which duplicates the logic in `db_auth_helpers.py`).

**Action required:**
```python
# In main.py — replace inline auth endpoints with:
from auth_routes import auth_router, set_auth_settings_ref
app.include_router(auth_router)
set_auth_settings_ref(SETTINGS)

# Then delete from main.py:
# - _db_get_user_by_username()
# - @app.post("/api/auth/login")
# - @app.get("/api/auth/me")
# - @app.post("/api/settings/ldap/test")
# - @app.post("/api/settings/ldap/save")
```

### 18.2 `_db_get_user_by_username` Duplication

`main.py` contains a standalone `_db_get_user_by_username` function that opens its own `psycopg2` connection. This duplicates `db_auth_helpers.get_user_by_username()` which uses the shared connection pool from `DBClient`. The standalone version should be removed once `auth_routes.py` is integrated.

### 18.3 Pending Features (originally marked "future")

| Feature | Status | Notes |
|---------|--------|-------|
| Rate limiter middleware | ❌ Not started | Placeholder comment in §7.2 |
| CSV export of audit logs | ❌ Not started | super_admin only |
| Full multi-studio isolation | ❌ Schema scaffold only | `studio_access` table exists, no logic |
| `POST /api/auth/logout` | ⚠️ Client-side only | Server does not maintain a token denylist |

### 18.4 CORS Configuration

`main.py` currently sets `allow_origins=["*"]`. This must be restricted to specific frontend origins in production:

```python
app.add_middleware(CORSMiddleware,
    allow_origins=["https://your-dashboard-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Appendix A — Actual File Structure

```
CocoStation/
│
├── api/
│   ├── auth.py              ← JWT encode/decode, bcrypt, LDAP verify, dependency factories
│   ├── auth_routes.py       ← ⚠️ Refactored auth APIRouter — NOT YET integrated into main.py
│   ├── db_auth_helpers.py   ← Auth-specific DB helpers (get_user_by_username, update_last_login)
│   ├── db_client.py         ← All DB queries: users, roles, permissions, logs, schedules, playlists
│   ├── main.py              ← FastAPI app, all route registrations, WebSocket, state management
│   ├── migrate.py           ← Schema creation, seed super_admin & system roles
│   ├── rbac.py              ← Role CRUD, extended user creation, apply-role-template
│   ├── scheduler.py         ← APScheduler engine: one-off + recurring + mixer jobs
│   ├── schemas.py           ← All Pydantic request/response models
│   ├── tts.py               ← Edge TTS generator (7 languages, async, MP3 output)
│   ├── requirements.txt
│   └── Dockerfile
│
└── dashboard/src/
    │
    ├── context/
    │   ├── AppContext.jsx          ← Global state, auth, permission helpers, WebSocket handler
    │   ├── AppContextInstance.js   ← Singleton context export
    │   ├── useApp.js               ← Context consumer hook
    │   ├── usePermission.js        ← Permission-specific convenience hook
    │   └── api_auth_patch.js       ← Auth API utility patch
    │
    ├── components/
    │   ├── AnnouncementSchedules.jsx ← Announcement scheduler sub-component
    │   ├── DeckPanel.jsx             ← Individual deck UI (play/pause/volume/track)
    │   ├── LibraryManager.jsx        ← Track library browser and uploader
    │   ├── OnAirButton.jsx           ← On-air state toggle with chime/beep control
    │   ├── PermissionGate.jsx        ← Inline UI element permission wrapper
    │   ├── ProtectedRoute.jsx        ← Route-level guard with Access Denied screen
    │   ├── SchedulerPanel.jsx        ← Schedule management UI panel
    │   ├── SessionGuard.jsx          ← JWT expiry watcher + "Stay signed in" modal
    │   └── Sidebar.jsx               ← Nav filtered by hasFeature()
    │
    └── pages/
        ├── AnnouncementsPage.jsx  ← TTS + MP3 announcement management
        ├── LibraryPage.jsx        ← Full library page (uses LibraryManager)
        ├── LoginPage.jsx          ← Login form, remember me, role badge preview
        ├── MixerPage.jsx          ← Main mixer (4 DeckPanels + crossfader)
        ├── RequestPage.jsx        ← Listener music request queue
        ├── SchedulesPage.jsx      ← One-off + recurring schedule management
        ├── SettingsPage.jsx       ← System config (LDAP, ducking, jingles — admin-gated)
        ├── StatisticsPage.jsx     ← Uptime + playback stats dashboard
        └── UsersPage.jsx          ← User + role management (admin-gated)
```

---

## Appendix B — Environment Variables

```bash
# ── JWT ─────────────────────────────────────────────────────────
JWT_SECRET=<strong-random-secret-min-32-chars>

# ── Database ─────────────────────────────────────────────────────
POSTGRES_USER=coco
POSTGRES_PASSWORD=coco_secret
POSTGRES_HOST=db
POSTGRES_DB=cocostation
# Full URL alternative (used by some clients):
DATABASE_URL=postgresql://coco:coco_secret@db:5432/cocostation

# ── Services ─────────────────────────────────────────────────────
FFMPEG_HOST=ffmpeg-mixer     # hostname of the ffmpeg-mixer container
MEDIAMTX_HOST=mediamtx       # hostname of the MediaMTX container

# ── LDAP (optional) ──────────────────────────────────────────────
LDAP_ENABLED=false
LDAP_SERVER=ldap://ad.company.com
LDAP_PORT=389
LDAP_BASE_DN=dc=company,dc=com
LDAP_BIND_DN=cn=svc,dc=company,dc=com
LDAP_BIND_PW=<service-account-password>
LDAP_USER_FILTER=(sAMAccountName={username})
LDAP_ATTR_NAME=cn
LDAP_ATTR_EMAIL=mail
LDAP_ROLE_ADMIN_GROUP=CN=RadioAdmins,OU=Groups,DC=company,DC=com
LDAP_USE_SSL=false
LDAP_TLS_VERIFY=true
```

---

*CocoStation RBAC Architecture v1.1 — updated 2026-04-18 to reflect actual implementation.*
