# CocoStation — LDAP Roles & Permissions Guide
## Directory-Based Access Control · Group-to-Role Mapping · Configuration Reference

> **Stack:** FastAPI · ldap3 · PostgreSQL  
> **Version:** 1.0  
> **Last Updated:** 2026-04-30

---

## Table of Contents

1. [Overview](#1-overview)
2. [Role Hierarchy](#2-role-hierarchy)
3. [LDAP Group → Role Mapping](#3-ldap-group--role-mapping)
4. [Permission Matrix per Role](#4-permission-matrix-per-role)
5. [LDAP Configuration Reference](#5-ldap-configuration-reference)
6. [Active Directory Setup Example](#6-active-directory-setup-example)
7. [OpenLDAP Setup Example](#7-openldap-setup-example)
8. [Custom Role Mappings](#8-custom-role-mappings)
9. [API Endpoints](#9-api-endpoints)
10. [Authentication Flow](#10-authentication-flow)
11. [Environment Variables](#11-environment-variables)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Overview

CocoStation supports two authentication modes that can run **simultaneously**:

| Mode | Description |
|------|-------------|
| **Local** | Username + bcrypt password stored in PostgreSQL. Always available (cocoadmin fallback). |
| **LDAP / Active Directory** | Bind against your corporate directory. Roles derived from LDAP group membership. |

When LDAP is enabled, login attempts go to LDAP **first**. If LDAP fails or the user is not found, the system falls back to the local database. This means `cocoadmin` always works even if LDAP is down.

```
Login Request
      │
      ▼
LDAP Enabled? ──NO──► Local DB Auth
      │
      YES
      ▼
LDAP Bind Success? ──NO──► Fallback to Local DB Auth
      │
      YES
      ▼
Resolve Role from memberOf groups
      │
      ▼
Return JWT + Permissions
```

---

## 2. Role Hierarchy

CocoStation has **4 built-in system roles** and supports **unlimited custom roles**. The hierarchy from highest to lowest privilege:

```
┌─────────────────────────────────────────────────────────────────┐
│                     COCOSTATION ROLE HIERARCHY                  │
│                                                                 │
│  ⭐ super_admin  ──── Full access, system settings, user mgmt  │
│       │                                                         │
│  🛡  admin      ──── User mgmt, content, NO system settings    │
│       │                                                         │
│  🎛  operator   ──── Full deck control, NO user management     │
│       │                                                         │
│  👁  viewer     ──── Read-only, deck view only                 │
│       │                                                         │
│  🔧  custom_*   ──── Any mix of permissions, admin-defined     │
└─────────────────────────────────────────────────────────────────┘
```

**Resolution priority** (when a user belongs to multiple LDAP groups):

```
super_admin > admin > operator > viewer > custom (list order)
```

The first matching group from the top wins.

---

## 3. LDAP Group → Role Mapping

### 3.1 Built-in Role Group DNs

Each built-in role maps to exactly one LDAP group DN. Configure these in Settings → LDAP.

| Role | Setting Key | Example DN |
|------|-------------|------------|
| `super_admin` | `ldap_role_super_admin_group` | `CN=CocoSuperAdmins,OU=Groups,DC=company,DC=com` |
| `admin` | `ldap_role_admin_group` | `CN=CocoAdmins,OU=Groups,DC=company,DC=com` |
| `operator` | `ldap_role_operator_group` | `CN=CocoOperators,OU=Groups,DC=company,DC=com` |
| `viewer` | `ldap_role_viewer_group` | `CN=CocoViewers,OU=Groups,DC=company,DC=com` |

### 3.2 Custom Role Group Mappings

For custom roles (e.g. `custom_dj`, `custom_producer`), provide an ordered list in `ldap_role_custom_groups`. Each entry has:

```json
{
  "group_dn": "CN=RadioDJs,OU=Groups,DC=company,DC=com",
  "role_name": "custom_dj"
}
```

Custom roles are evaluated **after** built-in roles and **in list order**. The first match wins.

### 3.3 Resolution Algorithm

```python
def _resolve_ldap_role(member_of: list, ldap_cfg: dict) -> str:
    # 1. Check super_admin group
    if super_admin_group in member_of → return "super_admin"
    # 2. Check admin group
    if admin_group in member_of → return "admin"
    # 3. Check operator group
    if operator_group in member_of → return "operator"
    # 4. Check viewer group
    if viewer_group in member_of → return "viewer"
    # 5. Check custom groups in order
    for mapping in role_custom_groups:
        if mapping.group_dn in member_of → return mapping.role_name
    # 6. Default fallback
    return "operator"
```

> **Note:** Group DNs are compared **case-insensitively**.

---

## 4. Permission Matrix per Role

### 4.1 Feature Flags

| Feature | super_admin | admin | operator | viewer | custom |
|---------|:-----------:|:-----:|:--------:|:------:|:------:|
| `can_library` — Media Library | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `can_announce` — Announcements | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `can_schedule` — Scheduler | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `can_requests` — Song Requests | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `can_settings` — System Settings | ✅ | ❌ | ❌ | ❌ | ⚙️ |

### 4.2 Deck Control (per deck A/B/C/D)

| Capability | super_admin | admin | operator | viewer | custom |
|------------|:-----------:|:-----:|:--------:|:------:|:------:|
| View deck | ✅ | ✅ | ✅ | ✅ | ⚙️ |
| Control deck | ✅ | ✅ | ✅ | ❌ | ⚙️ |

### 4.3 Deck Actions

| Action | super_admin | admin | operator | viewer | custom |
|--------|:-----------:|:-----:|:--------:|:------:|:------:|
| `deck.play` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `deck.pause` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `deck.stop` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `deck.next` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `deck.previous` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `deck.volume` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `deck.crossfader` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `deck.load_track` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `deck.load_playlist` | ✅ | ✅ | ✅ | ❌ | ⚙️ |

### 4.4 Playlist Permissions

| Permission | super_admin | admin | operator | viewer | custom |
|------------|:-----------:|:-----:|:--------:|:------:|:------:|
| `playlist.view` | ✅ | ✅ | ✅ | ✅ | ⚙️ |
| `playlist.load` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `playlist.create` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `playlist.edit` | ✅ | ✅ | ✅ | ❌ | ⚙️ |
| `playlist.delete` | ✅ | ✅ | ❌ | ❌ | ⚙️ |

### 4.5 User & Role Management

| Capability | super_admin | admin | operator | viewer | custom |
|------------|:-----------:|:-----:|:--------:|:------:|:------:|
| View users | ✅ | ✅ | ❌ | ❌ | ⚙️ |
| Create users | ✅ | ✅* | ❌ | ❌ | ⚙️ |
| Create admin/super_admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit users | ✅ | ✅ | ❌ | ❌ | ⚙️ |
| Delete users | ✅ | ✅ | ❌ | ❌ | ⚙️ |
| Create roles | ✅ | ✅ | ❌ | ❌ | ⚙️ |
| Edit roles | ✅ | ✅ | ❌ | ❌ | ⚙️ |
| Delete roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configure LDAP | ✅ | ✅ | ❌ | ❌ | ❌ |

> `*` Admins can create operator/viewer/custom users but NOT other admins or super_admins.

---

## 5. LDAP Configuration Reference

All fields are saved in the `settings` table and applied at runtime. No restart needed.

### 5.1 Connection Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ldap_enabled` | bool | `false` | Enable LDAP authentication |
| `ldap_server` | string | — | LDAP server URL. e.g. `ldap://192.168.1.10` or `ldaps://ad.company.com` |
| `ldap_port` | int | `389` | Port. Use `636` for LDAPS |
| `ldap_base_dn` | string | — | Base DN to search. e.g. `DC=company,DC=com` |
| `ldap_bind_dn` | string | — | Service account DN for initial bind |
| `ldap_bind_pw` | string | — | Service account password |
| `ldap_use_ssl` | bool | `false` | Use LDAPS (TLS) |
| `ldap_tls_verify` | bool | `true` | Verify TLS certificate. Set `false` for self-signed certs in dev |

### 5.2 User Search Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ldap_user_filter` | string | `(sAMAccountName={username})` | LDAP search filter. `{username}` is replaced at runtime |
| `ldap_attr_name` | string | `cn` | Attribute for display name |
| `ldap_attr_email` | string | `mail` | Attribute for email address |

> Use `(uid={username})` for OpenLDAP instead of `sAMAccountName`.

### 5.3 Role Group Mappings

| Field | Type | Description |
|-------|------|-------------|
| `ldap_role_super_admin_group` | string | Full DN of the super_admin group |
| `ldap_role_admin_group` | string | Full DN of the admin group |
| `ldap_role_operator_group` | string | Full DN of the operator group |
| `ldap_role_viewer_group` | string | Full DN of the viewer group |
| `ldap_role_custom_groups` | JSON array | List of `{group_dn, role_name}` objects for custom roles |

---

## 6. Active Directory Setup Example

### 6.1 Create LDAP Groups in AD

```
Domain: company.com
OU: OU=CocoStation,OU=Groups,DC=company,DC=com

Groups to create:
  CN=CocoSuperAdmins   → super_admin role
  CN=CocoAdmins        → admin role
  CN=CocoOperators     → operator role (DJs, broadcast staff)
  CN=CocoViewers       → viewer role (monitoring, read-only)
  CN=CocoDJs           → custom_dj role (custom permissions)
```

### 6.2 Service Account

Create a **read-only** service account to perform the initial user search bind:

```
User: svc-cocostation
OU:   OU=ServiceAccounts,DC=company,DC=com
DN:   CN=svc-cocostation,OU=ServiceAccounts,DC=company,DC=com

Permissions required:
  - Read access to user objects (sAMAccountName, cn, mail, memberOf)
  - Read access to group objects
  - Scope: entire base DN subtree
```

### 6.3 CocoStation LDAP Configuration (AD)

```json
{
  "server": "ldap://192.168.1.10",
  "port": 389,
  "base_dn": "DC=company,DC=com",
  "bind_dn": "CN=svc-cocostation,OU=ServiceAccounts,DC=company,DC=com",
  "bind_pw": "StrongServiceAccountPassword!",
  "user_filter": "(sAMAccountName={username})",
  "attr_name": "cn",
  "attr_email": "mail",
  "use_ssl": false,
  "tls_verify": true,
  "role_super_admin_group": "CN=CocoSuperAdmins,OU=CocoStation,OU=Groups,DC=company,DC=com",
  "role_admin_group":       "CN=CocoAdmins,OU=CocoStation,OU=Groups,DC=company,DC=com",
  "role_operator_group":    "CN=CocoOperators,OU=CocoStation,OU=Groups,DC=company,DC=com",
  "role_viewer_group":      "CN=CocoViewers,OU=CocoStation,OU=Groups,DC=company,DC=com",
  "role_custom_groups": [
    {
      "group_dn": "CN=CocoDJs,OU=CocoStation,OU=Groups,DC=company,DC=com",
      "role_name": "custom_dj"
    }
  ]
}
```

### 6.4 LDAPS (Secure) Configuration

```json
{
  "server": "ldaps://ad.company.com",
  "port": 636,
  "use_ssl": true,
  "tls_verify": true
}
```

> For self-signed certificates in dev/staging, set `"tls_verify": false`.

---

## 7. OpenLDAP Setup Example

### 7.1 Directory Structure

```
dc=company,dc=com
├── ou=People
│   ├── uid=alice          → operator, member of cn=CocoOperators
│   ├── uid=bob            → admin, member of cn=CocoAdmins
│   └── uid=carol          → viewer, member of cn=CocoViewers
└── ou=Groups
    ├── cn=CocoSuperAdmins  (groupOfNames)
    ├── cn=CocoAdmins       (groupOfNames)
    ├── cn=CocoOperators    (groupOfNames)
    └── cn=CocoViewers      (groupOfNames)
```

### 7.2 CocoStation LDAP Configuration (OpenLDAP)

```json
{
  "server": "ldap://192.168.1.20",
  "port": 389,
  "base_dn": "dc=company,dc=com",
  "bind_dn": "cn=admin,dc=company,dc=com",
  "bind_pw": "adminpassword",
  "user_filter": "(uid={username})",
  "attr_name": "cn",
  "attr_email": "mail",
  "use_ssl": false,
  "tls_verify": true,
  "role_super_admin_group": "cn=CocoSuperAdmins,ou=Groups,dc=company,dc=com",
  "role_admin_group":       "cn=CocoAdmins,ou=Groups,dc=company,dc=com",
  "role_operator_group":    "cn=CocoOperators,ou=Groups,dc=company,dc=com",
  "role_viewer_group":      "cn=CocoViewers,ou=Groups,dc=company,dc=com",
  "role_custom_groups": []
}
```

> **Note:** For OpenLDAP with `groupOfNames` or `posixGroup`, the `memberOf` overlay must be enabled on the server for group membership to appear on user objects.

---

## 8. Custom Role Mappings

Custom roles must **first exist in CocoStation** before you can map an LDAP group to them.

### Step 1 — Create the Custom Role in CocoStation

```http
POST /api/roles
Authorization: Bearer <admin_or_superadmin_token>

{
  "name": "custom_dj",
  "display_name": "DJ",
  "description": "On-air DJs: full deck control, no scheduling or user management",
  "color": "#7C3AED",
  "default_allowed_decks": ["a", "b"],
  "default_deck_control": {
    "a": { "view": true, "control": true },
    "b": { "view": true, "control": true },
    "c": { "view": true, "control": false },
    "d": { "view": false, "control": false }
  },
  "default_deck_actions": [
    "deck.play", "deck.pause", "deck.stop",
    "deck.next", "deck.volume", "deck.load_track"
  ],
  "default_playlist_perms": ["playlist.view", "playlist.load"],
  "default_can_library": true,
  "default_can_announce": true,
  "default_can_schedule": false,
  "default_can_requests": true,
  "default_can_settings": false
}
```

### Step 2 — Map the LDAP Group to the Custom Role

```http
POST /api/settings/ldap/save?enabled=true
Authorization: Bearer <admin_or_superadmin_token>

{
  "role_custom_groups": [
    {
      "group_dn": "CN=RadioDJs,OU=Groups,DC=company,DC=com",
      "role_name": "custom_dj"
    },
    {
      "group_dn": "CN=RadioProducers,OU=Groups,DC=company,DC=com",
      "role_name": "custom_producer"
    }
  ]
}
```

### Step 3 — Verify

```http
POST /api/settings/ldap/test
Authorization: Bearer <token>
```

---

## 9. API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/auth/methods` | Public | Returns enabled login methods (local/ldap) |
| `POST` | `/api/auth/login` | Public | Login. Body: `{username, password, login_method}` |
| `POST` | `/api/auth/refresh` | JWT | Refresh token without re-entering password |
| `GET` | `/api/auth/me` | JWT | Current user + fresh permissions |
| `POST` | `/api/auth/logout` | JWT | Audit logout (client must discard token) |

**login_method options:**

| Value | Behaviour |
|-------|-----------|
| `"auto"` | Try LDAP first, fall back to local DB |
| `"local"` | Force local DB only |
| `"ldap"` | Force LDAP only (401 if LDAP fails) |

### LDAP Management (admin/super_admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/settings/ldap/test` | Test connection without saving |
| `POST` | `/api/settings/ldap/save?enabled=true` | Save LDAP configuration |
| `GET` | `/api/settings/ldap/info` | Query directory stats (user count, groups) |

### Role Management

| Method | Endpoint | Required Role | Description |
|--------|----------|:-------------:|-------------|
| `GET` | `/api/roles` | Any | List all roles |
| `GET` | `/api/roles/{id}` | Any | Get role by ID |
| `POST` | `/api/roles` | admin+ | Create custom role |
| `PUT` | `/api/roles/{id}` | admin+ | Update role |
| `DELETE` | `/api/roles/{id}` | super_admin | Delete custom role |
| `GET` | `/api/permissions/catalogue` | Any | All permission keys |

### User Management

| Method | Endpoint | Required Role | Description |
|--------|----------|:-------------:|-------------|
| `POST` | `/api/users/extended` | admin+ | Create user with full permission control |
| `POST` | `/api/users/{id}/apply-role-template` | admin+ | Reset user perms to role defaults |
| `GET` | `/api/users/{id}/effective-permissions` | self or admin+ | Get merged effective permissions |

---

## 10. Authentication Flow

### LDAP Login — Full Sequence

```
Client                    CocoStation API              LDAP Server
  │                             │                           │
  │── POST /api/auth/login ────►│                           │
  │   {username, password}      │                           │
  │                             │── Bind (service acct) ───►│
  │                             │◄─ Bind OK ────────────────│
  │                             │── Search user filter ─────►│
  │                             │◄─ Return DN + memberOf ───│
  │                             │── Bind (user DN + pw) ────►│
  │                             │◄─ Bind OK (auth success) ─│
  │                             │                           │
  │                             │  Resolve role from groups │
  │                             │  (priority order)         │
  │                             │                           │
  │                             │  Fetch permissions from DB│
  │                             │  (or apply role defaults) │
  │                             │                           │
  │◄── JWT + user + permissions─│                           │
```

### JWT Payload Structure

```json
{
  "sub": "ldap-alice",
  "username": "alice",
  "role": "admin",
  "is_super_admin": false,
  "exp": 1746021600
}
```

> LDAP users have `id = "ldap-{username}"`. If a matching local DB record exists, `last_login` is stamped on it.

---

## 11. Environment Variables

Add to your `.env` for LDAP defaults. Settings saved via the API override these at runtime (no restart needed after API save).

```dotenv
# ── LDAP / Active Directory ──────────────────────────────────────
LDAP_ENABLED=true
LDAP_SERVER=ldap://192.168.1.10
LDAP_PORT=389
LDAP_BASE_DN=DC=company,DC=com
LDAP_BIND_DN=CN=svc-cocostation,OU=ServiceAccounts,DC=company,DC=com
LDAP_BIND_PW=YourServiceAccountPassword

# User search
LDAP_USER_FILTER=(sAMAccountName={username})
LDAP_ATTR_NAME=cn
LDAP_ATTR_EMAIL=mail

# TLS
LDAP_USE_SSL=false
LDAP_TLS_VERIFY=true

# Built-in role group DNs
LDAP_ROLE_SUPER_ADMIN_GROUP=CN=CocoSuperAdmins,OU=Groups,DC=company,DC=com
LDAP_ROLE_ADMIN_GROUP=CN=CocoAdmins,OU=Groups,DC=company,DC=com
LDAP_ROLE_OPERATOR_GROUP=CN=CocoOperators,OU=Groups,DC=company,DC=com
LDAP_ROLE_VIEWER_GROUP=CN=CocoViewers,OU=Groups,DC=company,DC=com
```

> Custom group mappings (`ldap_role_custom_groups`) are stored as JSON in the database and managed via the API only.

---

## 12. Troubleshooting

### User gets the wrong role after login

1. Check the user's `memberOf` groups via `GET /api/settings/ldap/info`.
2. Verify group DNs are exact full DNs (comparison is case-insensitive but must be complete).
3. Check priority: if a user is in both `CocoAdmins` and `CocoOperators`, they get `admin` (higher priority).

### "LDAP authentication failed" but credentials are correct

- Verify `bind_dn` and `bind_pw` with an LDAP browser (Apache Directory Studio, ldapsearch).
- Check `user_filter` matches your schema: `sAMAccountName` for AD, `uid` for OpenLDAP.
- Run `POST /api/settings/ldap/test` to isolate connectivity from credential issues.

### LDAPS / TLS certificate errors

- Set `ldap_tls_verify: false` temporarily for self-signed certs.
- Ensure the certificate CN/SAN matches the hostname in `ldap_server`.
- Use port `636` for LDAPS, not `389`.

### LDAP users have no permissions after first login

LDAP users inherit permissions from their resolved role's defaults. If the role exists but has no permissions seeded:

1. Confirm `GET /api/roles` returns the role with correct `default_*` fields.
2. Call `POST /api/users/{id}/apply-role-template` to force-apply defaults to the user.

### cocoadmin can't log in after enabling LDAP

`cocoadmin` is a local DB user. Use `login_method: "local"` in your login request body, or click "Local Login" in the UI if available. LDAP and local auth always coexist.

---

## Appendix A — Sample Users & Resolved Roles

| Username | LDAP Groups | Resolved Role | Notes |
|----------|-------------|:-------------:|-------|
| `broadcast.admin` | CocoSuperAdmins | `super_admin` | Full access |
| `station.manager` | CocoAdmins | `admin` | No system settings |
| `dj.morning` | CocoOperators, CocoDJs | `operator` | Operator wins (higher priority) |
| `dj.evening` | CocoDJs | `custom_dj` | Custom role |
| `monitor.user` | CocoViewers | `viewer` | Read-only |
| `intern` | (no matching group) | `operator` | Default fallback |

---

## Appendix B — Custom Role Examples

### custom_dj — On-Air DJ

```json
{
  "name": "custom_dj",
  "display_name": "DJ",
  "color": "#7C3AED",
  "default_allowed_decks": ["a", "b"],
  "default_deck_control": {
    "a": { "view": true, "control": true },
    "b": { "view": true, "control": true },
    "c": { "view": true, "control": false },
    "d": { "view": false, "control": false }
  },
  "default_deck_actions": [
    "deck.play", "deck.pause", "deck.stop",
    "deck.next", "deck.volume", "deck.load_track"
  ],
  "default_playlist_perms": ["playlist.view", "playlist.load"],
  "default_can_library": true,
  "default_can_announce": true,
  "default_can_schedule": false,
  "default_can_requests": true,
  "default_can_settings": false
}
```

### custom_producer — Content Producer

```json
{
  "name": "custom_producer",
  "display_name": "Producer",
  "color": "#059669",
  "default_allowed_decks": ["a", "b", "c", "d"],
  "default_deck_control": {
    "a": { "view": true, "control": false },
    "b": { "view": true, "control": false },
    "c": { "view": true, "control": false },
    "d": { "view": true, "control": false }
  },
  "default_deck_actions": [],
  "default_playlist_perms": [
    "playlist.view", "playlist.create",
    "playlist.edit", "playlist.delete"
  ],
  "default_can_library": true,
  "default_can_announce": true,
  "default_can_schedule": true,
  "default_can_requests": false,
  "default_can_settings": false
}
```

### custom_monitor — NOC / Monitoring

```json
{
  "name": "custom_monitor",
  "display_name": "Monitor",
  "color": "#0EA5E9",
  "default_allowed_decks": ["a", "b", "c", "d"],
  "default_deck_control": {
    "a": { "view": true, "control": false },
    "b": { "view": true, "control": false },
    "c": { "view": true, "control": false },
    "d": { "view": true, "control": false }
  },
  "default_deck_actions": [],
  "default_playlist_perms": ["playlist.view"],
  "default_can_library": false,
  "default_can_announce": false,
  "default_can_schedule": true,
  "default_can_requests": false,
  "default_can_settings": false
}
```
