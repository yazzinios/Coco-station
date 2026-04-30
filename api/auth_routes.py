"""
auth_routes.py — CocoStation
──────────────────────────────────────────────────────────────
Complete authentication router with:
  • POST /api/auth/login       — JWT login (local + LDAP)
  • POST /api/auth/refresh     — Refresh a still-valid token
  • GET  /api/auth/me          — Current user + fresh permissions
  • POST /api/settings/ldap/test — Test LDAP connection
  • POST /api/settings/ldap/save — Save LDAP config

HOW TO USE:
  In main.py, replace the inline auth endpoints with:

    from auth_routes import auth_router, set_auth_settings_ref
    app.include_router(auth_router)
    # After SETTINGS dict is defined:
    set_auth_settings_ref(SETTINGS)

  And remove the old _db_get_user_by_username function + login/me/ldap endpoints.
"""

import os
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel as _PydanticBase

from auth import (
    verify_token, verify_password, create_token,
    verify_ldap_credentials, test_ldap_connection, query_ldap_directory,
)
from db_client import db
from db_auth_helpers import get_user_by_username, update_last_login, get_user_by_id

# ── Shared reference to the main SETTINGS dict ─────────────────────────────
# Call set_auth_settings_ref(SETTINGS) right after defining SETTINGS in main.py

_SETTINGS_REF: dict = {}

def set_auth_settings_ref(settings_dict: dict):
    """Call once at startup to give this router access to SETTINGS."""
    global _SETTINGS_REF
    _SETTINGS_REF = settings_dict

auth_router = APIRouter(tags=["auth"])


@auth_router.get("/api/auth/methods")
def get_auth_methods():
    """Public endpoint — tells the frontend which login methods are available."""
    settings = _SETTINGS_REF
    ldap_enabled = bool(settings.get("ldap_enabled", False))
    ldap_server  = settings.get("ldap_server", "") or ""
    # Extract a friendly domain name from the LDAP server URL
    domain = ""
    if ldap_enabled and ldap_server:
        import re
        m = re.search(r'(?:ldaps?://)?([^/:]+)', ldap_server)
        if m:
            domain = m.group(1)
    return {
        "local": True,
        "ldap":  ldap_enabled and bool(ldap_server.strip()),
        "domain": domain,
        "company_name": settings.get("company_name", ""),
    }

# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _is_elevated(user: dict) -> bool:
    return user.get("role") == "admin" or bool(user.get("is_super_admin"))

def _get_client_ip(request: Request) -> str:
    return (
        request.headers.get("X-Forwarded-For", "")
        or (request.client.host if request.client else "unknown")
    ).split(",")[0].strip()

async def _fetch_permissions(user_id: str) -> dict:
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, db.get_permissions, user_id)
    except Exception:
        return {}

def _audit_login(user_id: str, username: str, method: str, ip: str):
    try:
        db.log_action(user_id, username, "login", {"method": method}, ip)
    except Exception:
        pass

def _audit_logout(user: dict, ip: str):
    try:
        db.log_action(user.get("sub", "?"), user.get("username", "?"), "logout", {}, ip)
    except Exception:
        pass

# ─────────────────────────────────────────────────────────────────────────────
#  Schemas
# ─────────────────────────────────────────────────────────────────────────────

class LoginRequest(_PydanticBase):
    username: str
    password: str
    login_method: str = "auto"   # "auto" | "local" | "ldap"

class LdapGroupMapping(_PydanticBase):
    """One custom LDAP group → CocoStation role mapping."""
    group_dn:  str  # Full DN, e.g. CN=RadioDJs,OU=Groups,DC=company,DC=com
    role_name: str  # Must match an existing role name, e.g. "custom_dj"


class LdapConfigRequest(_PydanticBase):
    server:                str
    port:                  int   = 389
    base_dn:               str   = ""
    bind_dn:               str   = ""
    bind_pw:               str   = ""
    user_filter:           str   = "(sAMAccountName={username})"
    attr_name:             str   = "cn"
    attr_email:            str   = "mail"
    # ── Role group mappings (built-in) ────────────────────────
    role_super_admin_group: str  = ""   # DN whose members become super_admin
    role_admin_group:       str  = ""   # DN whose members become admin
    role_operator_group:    str  = ""   # DN whose members become operator
    role_viewer_group:      str  = ""   # DN whose members become viewer
    # ── Custom role mappings (evaluated after built-ins) ──────
    role_custom_groups:    list  = []   # List of LdapGroupMapping dicts
    use_ssl:               bool  = False
    tls_verify:            bool  = True

# ─────────────────────────────────────────────────────────────────────────────
#  POST /api/auth/login
# ─────────────────────────────────────────────────────────────────────────────

@auth_router.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    """
    Public endpoint — authenticate and return JWT + user + permissions.

    Flow:
      1. If LDAP enabled → try LDAP first.
      2. Fallback to local DB (allows cocoadmin to always log in).
      3. On success: stamp last_login, return token + permissions.
    """
    settings   = _SETTINGS_REF
    expiry_hrs = int(settings.get("session_hours", 8))
    ip         = _get_client_ip(request)
    method     = req.login_method  # "auto" | "local" | "ldap"

    # ── 1. LDAP attempt (skip if method=local) ─────────────────
    if method != "local" and settings.get("ldap_enabled") and settings.get("ldap_server", "").strip():
        ldap_cfg = {
            "server":                 settings.get("ldap_server", ""),
            "port":                   settings.get("ldap_port", 389),
            "base_dn":                settings.get("ldap_base_dn", ""),
            "bind_dn":                settings.get("ldap_bind_dn", ""),
            "bind_pw":                settings.get("ldap_bind_pw", ""),
            "user_filter":            settings.get("ldap_user_filter", "(sAMAccountName={username})"),
            "attr_name":              settings.get("ldap_attr_name", "cn"),
            "attr_email":             settings.get("ldap_attr_email", "mail"),
            # built-in role group DNs (priority order in auth.py)
            "role_super_admin_group": settings.get("ldap_role_super_admin_group", ""),
            "role_admin_group":       settings.get("ldap_role_admin_group", ""),
            "role_operator_group":    settings.get("ldap_role_operator_group", ""),
            "role_viewer_group":      settings.get("ldap_role_viewer_group", ""),
            # custom group→role list
            "role_custom_groups":     settings.get("ldap_role_custom_groups", []),
            "use_ssl":                settings.get("ldap_use_ssl", False),
            "tls_verify":             settings.get("ldap_tls_verify", True),
        }
        loop      = asyncio.get_event_loop()
        ldap_user = await loop.run_in_executor(
            None, verify_ldap_credentials, req.username, req.password, ldap_cfg
        )
        if ldap_user:
            token = create_token(ldap_user, expiry_hours=expiry_hrs)
            _audit_login(ldap_user["id"], ldap_user["username"], "ldap", ip)
            # Stamp last_login for LDAP users if they exist in local DB
            try:
                loop = asyncio.get_event_loop()
                local = await loop.run_in_executor(None, get_user_by_username, db, req.username)
                if local:
                    await loop.run_in_executor(None, update_last_login, db, local["id"])
            except Exception:
                pass
            perms = await _fetch_permissions(ldap_user["id"])
            return _login_response(token, ldap_user, perms, expiry_hrs, source="ldap")

        print(f"[auth] LDAP auth failed for '{req.username}' — falling back to local DB")

    # ── 2. Local DB login (skip if method=ldap) ─────────────────
    if method == "ldap":
        raise HTTPException(status_code=401, detail="LDAP authentication failed. Check your domain credentials.")

    # ── 2. Local DB login ───────────────────────────────────────
    loop     = asyncio.get_event_loop()
    user_row = await loop.run_in_executor(None, get_user_by_username, db, req.username)

    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not user_row.get("enabled", True):
        raise HTTPException(status_code=403, detail="Account is disabled. Contact your administrator.")

    if not verify_password(req.password, user_row.get("password_hash") or ""):
        # Audit failed attempt
        try:
            db.log_action(user_row["id"], user_row["username"], "login_failed", {"reason": "bad_password"}, ip)
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # ── 3. Success ──────────────────────────────────────────────
    # Stamp last_login (fire-and-forget)
    await loop.run_in_executor(None, update_last_login, db, user_row["id"])

    token = create_token(user_row, expiry_hours=expiry_hrs)
    _audit_login(str(user_row["id"]), user_row["username"], "local", ip)

    perms = await _fetch_permissions(str(user_row["id"]))

    return _login_response(token, user_row, perms, expiry_hrs, source="local")


def _login_response(token: str, user: dict, perms: dict, expiry_hrs: int, source: str = "local") -> dict:
    return {
        "access_token":     token,
        "token_type":       "bearer",
        "expires_in":       expiry_hrs * 3600,   # seconds
        "expires_in_hours": expiry_hrs,
        "user": {
            "id":             str(user.get("id", "")),
            "username":       user.get("username", ""),
            "display_name":   user.get("display_name") or user.get("username", ""),
            "role":           user.get("role", "operator"),
            "is_super_admin": bool(user.get("is_super_admin", False)),
            "source":         source,
            "permissions":    perms,
        },
    }

# ─────────────────────────────────────────────────────────────────────────────
#  POST /api/auth/refresh
# ─────────────────────────────────────────────────────────────────────────────

@auth_router.post("/api/auth/refresh")
async def refresh_token(user: dict = Depends(verify_token)):
    """
    Exchange a still-valid JWT for a fresh one with a new expiry window.
    The old token must not yet be expired. No password needed.
    """
    settings   = _SETTINGS_REF
    expiry_hrs = int(settings.get("session_hours", 8))
    user_id    = user.get("sub")

    # Verify user still exists and is not disabled
    loop     = asyncio.get_event_loop()
    user_row = await loop.run_in_executor(None, get_user_by_id, db, user_id)

    if not user_row:
        raise HTTPException(status_code=401, detail="User no longer exists")
    if not user_row.get("enabled", True):
        raise HTTPException(status_code=403, detail="Account is disabled")

    # Issue fresh token with current role (in case it changed since last login)
    new_token = create_token(user_row, expiry_hours=expiry_hrs)
    perms     = await _fetch_permissions(user_id)

    try:
        db.log_action(user_id, user.get("username"), "token_refresh", {}, "internal")
    except Exception:
        pass

    return {
        "access_token":     new_token,
        "token_type":       "bearer",
        "expires_in":       expiry_hrs * 3600,
        "expires_in_hours": expiry_hrs,
        "user": {
            "id":             str(user_row["id"]),
            "username":       user_row["username"],
            "display_name":   user_row.get("display_name") or user_row["username"],
            "role":           user_row.get("role", "operator"),
            "is_super_admin": bool(user_row.get("is_super_admin", False)),
            "permissions":    perms,
        },
    }

# ─────────────────────────────────────────────────────────────────────────────
#  GET /api/auth/me
# ─────────────────────────────────────────────────────────────────────────────

@auth_router.get("/api/auth/me")
async def get_me(user: dict = Depends(verify_token)):
    """Return the currently authenticated user's info + fresh permissions."""
    user_id = user.get("sub")
    perms   = await _fetch_permissions(user_id)
    return {
        "id":             user_id,
        "username":       user.get("username"),
        "role":           user.get("role", "operator"),
        "is_super_admin": bool(user.get("is_super_admin", False)),
        "permissions":    perms,
    }

# ─────────────────────────────────────────────────────────────────────────────
#  POST /api/auth/logout  (optional — JWT is stateless, but useful for audit)
# ─────────────────────────────────────────────────────────────────────────────

@auth_router.post("/api/auth/logout")
async def logout(request: Request, user: dict = Depends(verify_token)):
    """Audit the logout. The client must discard the token on its side."""
    _audit_logout(user, _get_client_ip(request))
    return {"status": "ok", "message": "Logged out. Discard your token on the client."}

# ─────────────────────────────────────────────────────────────────────────────
#  LDAP test + save  (admin or super_admin required)
# ─────────────────────────────────────────────────────────────────────────────

@auth_router.post("/api/settings/ldap/test")
async def ldap_test(req: LdapConfigRequest, _user: dict = Depends(verify_token)):
    """Test LDAP connectivity without saving."""
    if not _is_elevated(_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, test_ldap_connection, req.dict())
    if result["ok"]:
        return {"status": "ok", "detail": result["detail"]}
    raise HTTPException(status_code=503, detail=result["detail"])


@auth_router.post("/api/settings/ldap/save")
async def ldap_save(
    req: LdapConfigRequest,
    request: Request,
    enabled: bool = True,
    _user: dict = Depends(verify_token),
):
    """Save LDAP configuration. Admin or super_admin only."""
    if not _is_elevated(_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    patch = {
        "ldap_enabled":                enabled,
        "ldap_server":                 req.server,
        "ldap_port":                   req.port,
        "ldap_base_dn":                req.base_dn,
        "ldap_bind_dn":                req.bind_dn,
        "ldap_bind_pw":                req.bind_pw,
        "ldap_user_filter":            req.user_filter,
        "ldap_attr_name":              req.attr_name,
        "ldap_attr_email":             req.attr_email,
        # built-in role group mappings
        "ldap_role_super_admin_group": req.role_super_admin_group,
        "ldap_role_admin_group":       req.role_admin_group,
        "ldap_role_operator_group":    req.role_operator_group,
        "ldap_role_viewer_group":      req.role_viewer_group,
        # custom role group mappings
        "ldap_role_custom_groups":     req.role_custom_groups,
        "ldap_use_ssl":                req.use_ssl,
        "ldap_tls_verify":             req.tls_verify,
    }

    # Update shared SETTINGS dict in main.py
    _SETTINGS_REF.update(patch)

    # Persist to DB
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, db.save_settings, patch)

    try:
        db.log_action(
            _user.get("sub"), _user.get("username"),
            "settings.ldap_save", {"enabled": enabled},
            _get_client_ip(request),
        )
    except Exception:
        pass

    return {"status": "ok", "ldap_enabled": enabled}


# ─────────────────────────────────────────────────────────────────────────────
#  LDAP role-mappings  GET + POST
# ─────────────────────────────────────────────────────────────────────────────

class LdapRoleMappingsRequest(_PydanticBase):
    """Payload for saving LDAP role-group mappings.

    The frontend (UsersPage LdapGroupMappingPanel) sends:
        { "mappings": { "admin": ["CN=Admins,..."], "operator": [...], ... } }

    where each key is a CocoStation role name and the value is a list of
    LDAP group DNs that should map to that role.
    """
    mappings: dict = {}   # { roleName: [groupDN, ...] }


def _mappings_to_settings(mappings: dict) -> dict:
    """Convert the frontend { roleName: [groups] } dict to the flat
    settings keys that the LDAP login flow reads from SETTINGS."""
    # Built-in role keys (first group DN wins for single-value fields)
    def _first(lst): return lst[0] if lst else ""

    # Keep all groups for each built-in role joined so the login flow can
    # iterate them. We store as a list of DNs under each key.
    patch = {
        "ldap_role_super_admin_group": _first(mappings.get("super_admin", [])),
        "ldap_role_admin_group":       _first(mappings.get("admin",       [])),
        "ldap_role_operator_group":    _first(mappings.get("operator",    [])),
        "ldap_role_viewer_group":      _first(mappings.get("viewer",      [])),
        # Custom roles → stored as [{group_dn, role_name}, ...] for the login flow
        "ldap_role_custom_groups": [
            {"group_dn": g, "role_name": role}
            for role, groups in mappings.items()
            if role not in ("super_admin", "admin", "operator", "viewer")
            for g in groups
        ],
        # Keep full mapping blob for the UI to reload exactly
        "ldap_role_mappings": mappings,
    }
    return patch


def _settings_to_mappings(s: dict) -> dict:
    """Reconstruct the { roleName: [groups] } dict from SETTINGS so the
    UI gets back exactly what it saved."""
    # If we stored the full blob, return it directly
    blob = s.get("ldap_role_mappings")
    if isinstance(blob, dict) and blob:
        return blob

    # Fallback: reconstruct from flat fields
    mappings = {}
    for role, key in [
        ("super_admin", "ldap_role_super_admin_group"),
        ("admin",       "ldap_role_admin_group"),
        ("operator",    "ldap_role_operator_group"),
        ("viewer",      "ldap_role_viewer_group"),
    ]:
        val = s.get(key, "")
        if val:
            mappings[role] = [val]
    for item in s.get("ldap_role_custom_groups", []):
        if isinstance(item, dict):
            r = item.get("role_name", "")
            g = item.get("group_dn",  "")
            if r and g:
                mappings.setdefault(r, []).append(g)
    return mappings


@auth_router.get("/api/settings/ldap/role-mappings")
async def get_ldap_role_mappings(_user: dict = Depends(verify_token)):
    """Return the currently saved LDAP group → role mappings."""
    if not _is_elevated(_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    mappings = _settings_to_mappings(_SETTINGS_REF)
    return {"mappings": mappings, "ldap_enabled": bool(_SETTINGS_REF.get("ldap_enabled", False))}


@auth_router.post("/api/settings/ldap/role-mappings")
async def save_ldap_role_mappings(
    req: LdapRoleMappingsRequest,
    request: Request,
    _user: dict = Depends(verify_token),
):
    """Persist LDAP group → role mappings. Admin or super_admin only."""
    if not _is_elevated(_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    patch = _mappings_to_settings(req.mappings)

    # Update the live SETTINGS dict
    _SETTINGS_REF.update(patch)

    # Persist to DB
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, db.save_settings, patch)

    try:
        db.log_action(
            _user.get("sub"), _user.get("username"),
            "settings.ldap_role_mappings_save",
            {"roles_configured": list(req.mappings.keys())},
            _get_client_ip(request),
        )
    except Exception:
        pass

    return {"status": "ok", "mappings": req.mappings}


# ─────────────────────────────────────────────────────────────────────────────
#  LDAP per-user role mappings  (GET / POST / DELETE)
# ─────────────────────────────────────────────────────────────────────────────

class LdapUserMappingRequest(_PydanticBase):
    """Payload for creating/updating a per-user LDAP override."""
    ldap_username: str          # The LDAP sAMAccountName (or UPN prefix)
    role:          str          # CocoStation role name
    note:          str = ""     # Optional admin note


@auth_router.get("/api/settings/ldap/user-mappings")
async def list_ldap_user_mappings(_user: dict = Depends(verify_token)):
    """Return all per-user LDAP username → role overrides."""
    if not _is_elevated(_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    loop = asyncio.get_event_loop()
    rows = await loop.run_in_executor(None, db.list_ldap_user_mappings)
    return {"user_mappings": rows}


@auth_router.post("/api/settings/ldap/user-mappings")
async def save_ldap_user_mapping(
    req: LdapUserMappingRequest,
    request: Request,
    _user: dict = Depends(verify_token),
):
    """Create or update a per-user LDAP username → role override."""
    if not _is_elevated(_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    if not req.ldap_username.strip():
        raise HTTPException(status_code=400, detail="ldap_username is required")
    if not req.role.strip():
        raise HTTPException(status_code=400, detail="role is required")
    # Validate role exists
    loop = asyncio.get_event_loop()
    all_roles = await loop.run_in_executor(None, db.list_roles)
    valid_names = {r["name"] for r in all_roles}
    if req.role not in valid_names:
        raise HTTPException(status_code=400, detail=f"Unknown role '{req.role}'. Valid: {sorted(valid_names)}")
    await loop.run_in_executor(
        None, db.save_ldap_user_mapping, req.ldap_username.strip(), req.role.strip(), req.note or ""
    )
    try:
        db.log_action(
            _user.get("sub"), _user.get("username"),
            "settings.ldap_user_mapping_save",
            {"ldap_username": req.ldap_username, "role": req.role},
            _get_client_ip(request),
        )
    except Exception:
        pass
    return {"status": "ok", "ldap_username": req.ldap_username, "role": req.role}


@auth_router.delete("/api/settings/ldap/user-mappings/{ldap_username}")
async def delete_ldap_user_mapping(
    ldap_username: str,
    request: Request,
    _user: dict = Depends(verify_token),
):
    """Remove a per-user LDAP username → role override."""
    if not _is_elevated(_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, db.delete_ldap_user_mapping, ldap_username)
    try:
        db.log_action(
            _user.get("sub"), _user.get("username"),
            "settings.ldap_user_mapping_delete",
            {"ldap_username": ldap_username},
            _get_client_ip(request),
        )
    except Exception:
        pass
    return {"status": "ok", "deleted": ldap_username}


@auth_router.get("/api/settings/ldap/info")
async def ldap_info(_user: dict = Depends(verify_token)):
    """Query the configured LDAP server and return directory statistics:
    user count, group count, and list of group names.
    Uses the currently saved LDAP settings — no body required.
    """
    s = _SETTINGS_REF  # the global SETTINGS dict injected via set_auth_settings_ref
    if not s.get("ldap_enabled") or not s.get("ldap_server", "").strip():
        raise HTTPException(status_code=400, detail="LDAP is not enabled or not configured")

    ldap_cfg = {
        "server":      s.get("ldap_server", ""),
        "port":        s.get("ldap_port", 389),
        "base_dn":     s.get("ldap_base_dn", ""),
        "bind_dn":     s.get("ldap_bind_dn", ""),
        "bind_pw":     s.get("ldap_bind_pw", ""),
        "use_ssl":     s.get("ldap_use_ssl", False),
        "tls_verify":  s.get("ldap_tls_verify", True),
    }

    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, query_ldap_directory, ldap_cfg)
    return result
