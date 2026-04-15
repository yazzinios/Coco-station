"""
rbac.py — CocoStation Role-Based Access Control
================================================
Provides:
  • Role CRUD  (GET/POST/PUT/DELETE /api/roles)
  • Role permission templates
  • User ↔ Role assignment helpers
  • Apply role defaults to a user's permissions
  • Permission catalogue endpoint for the frontend
"""

from __future__ import annotations

import uuid
import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import verify_token, hash_password, require_admin, require_super_admin

# ── Permission catalogue ───────────────────────────────────────────────────────

ALL_DECK_ACTIONS: List[str] = [
    "deck.play",
    "deck.pause",
    "deck.stop",
    "deck.next",
    "deck.previous",
    "deck.volume",
    "deck.crossfader",
    "deck.load_track",
    "deck.load_playlist",
]

ALL_PLAYLIST_PERMS: List[str] = [
    "playlist.view",
    "playlist.load",
    "playlist.create",
    "playlist.edit",
    "playlist.delete",
]

DECK_IDS = ["a", "b", "c", "d"]


def _full_deck_control(view: bool = True, control: bool = True) -> Dict[str, dict]:
    return {d: {"view": view, "control": control} for d in DECK_IDS}


# ── Built-in role definitions (seeded into DB on first run) ───────────────────

SYSTEM_ROLES: List[Dict[str, Any]] = [
    {
        "name":                   "super_admin",
        "display_name":           "Super Admin",
        "description":            "Full unrestricted access to everything.",
        "color":                  "#DC2626",
        "is_system":              True,
        "default_allowed_decks":  DECK_IDS,
        "default_deck_control":   _full_deck_control(True, True),
        "default_deck_actions":   ALL_DECK_ACTIONS,
        "default_playlist_perms": ALL_PLAYLIST_PERMS,
        "default_can_announce":   True,
        "default_can_schedule":   True,
        "default_can_library":    True,
        "default_can_requests":   True,
        "default_can_settings":   True,
    },
    {
        "name":                   "admin",
        "display_name":           "Admin",
        "description":            "Manage users and content. Cannot change system settings.",
        "color":                  "#D97706",
        "is_system":              True,
        "default_allowed_decks":  DECK_IDS,
        "default_deck_control":   _full_deck_control(True, True),
        "default_deck_actions":   ALL_DECK_ACTIONS,
        "default_playlist_perms": ALL_PLAYLIST_PERMS,
        "default_can_announce":   True,
        "default_can_schedule":   True,
        "default_can_library":    True,
        "default_can_requests":   True,
        "default_can_settings":   False,
    },
    {
        "name":                   "operator",
        "display_name":           "Operator",
        "description":            "Full deck control. Cannot manage users or settings.",
        "color":                  "#2563EB",
        "is_system":              True,
        "default_allowed_decks":  DECK_IDS,
        "default_deck_control":   _full_deck_control(True, True),
        "default_deck_actions":   ALL_DECK_ACTIONS,
        "default_playlist_perms": ["playlist.view", "playlist.load", "playlist.create", "playlist.edit"],
        "default_can_announce":   True,
        "default_can_schedule":   True,
        "default_can_library":    True,
        "default_can_requests":   True,
        "default_can_settings":   False,
    },
    {
        "name":                   "viewer",
        "display_name":           "Viewer",
        "description":            "Read-only. Can see decks but cannot control anything.",
        "color":                  "#6B7280",
        "is_system":              True,
        "default_allowed_decks":  DECK_IDS,
        "default_deck_control":   _full_deck_control(True, False),
        "default_deck_actions":   [],
        "default_playlist_perms": ["playlist.view"],
        "default_can_announce":   False,
        "default_can_schedule":   False,
        "default_can_library":    False,
        "default_can_requests":   False,
        "default_can_settings":   False,
    },
]

# ── Pydantic schemas ───────────────────────────────────────────────────────────

class RoleCreateRequest(BaseModel):
    name:         str
    display_name: str
    description:  Optional[str] = ""
    color:        Optional[str] = "#6B7280"
    default_allowed_decks:  List[str]            = None  # type: ignore
    default_deck_control:   Optional[Dict[str, dict]] = None
    default_deck_actions:   Optional[List[str]]  = None
    default_playlist_perms: Optional[List[str]]  = None
    default_can_announce:   bool                 = True
    default_can_schedule:   bool                 = True
    default_can_library:    bool                 = True
    default_can_requests:   bool                 = True
    default_can_settings:   bool                 = False


class RoleUpdateRequest(BaseModel):
    display_name:           Optional[str]             = None
    description:            Optional[str]             = None
    color:                  Optional[str]             = None
    default_allowed_decks:  Optional[List[str]]       = None
    default_deck_control:   Optional[Dict[str, dict]] = None
    default_deck_actions:   Optional[List[str]]       = None
    default_playlist_perms: Optional[List[str]]       = None
    default_can_announce:   Optional[bool]            = None
    default_can_schedule:   Optional[bool]            = None
    default_can_library:    Optional[bool]            = None
    default_can_requests:   Optional[bool]            = None
    default_can_settings:   Optional[bool]            = None


class UserCreateExtendedRequest(BaseModel):
    username:     str
    display_name: Optional[str] = None
    password:     str
    role:         str = "operator"
    # Optional per-user permission overrides applied at creation time
    allowed_decks:  Optional[List[str]]            = None
    deck_control:   Optional[Dict[str, dict]]      = None
    deck_actions:   Optional[List[str]]            = None
    playlist_perms: Optional[List[str]]            = None
    can_announce:   Optional[bool]                 = None
    can_schedule:   Optional[bool]                 = None
    can_library:    Optional[bool]                 = None
    can_requests:   Optional[bool]                 = None
    can_settings:   Optional[bool]                 = None


class ApplyRoleTemplateRequest(BaseModel):
    """Reset a user's permissions to the defaults of their (or a given) role."""
    role_name: Optional[str] = None   # if None, use the user's current role


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api", tags=["RBAC"])


# ── Internal helpers ───────────────────────────────────────────────────────────

def _is_elevated(user: dict) -> bool:
    return user.get("role") == "admin" or bool(user.get("is_super_admin"))


def _audit(request: Request, user: dict, action: str, details: dict = None):
    try:
        from db_client import db
        ip = (
            request.headers.get("X-Forwarded-For", "")
            or (request.client.host if request.client else "unknown")
        ).split(",")[0].strip()
        db.log_action(
            user_id  = user.get("sub", "unknown"),
            username = user.get("username", "unknown"),
            action   = action,
            details  = details or {},
            ip       = ip,
        )
    except Exception as e:
        print(f"[rbac audit] {e}")


def _role_to_perms(role_obj: Optional[dict]) -> dict:
    """Convert a roles-table row into the user_permissions dict format."""
    if not role_obj:
        return {
            "allowed_decks":  DECK_IDS,
            "deck_control":   _full_deck_control(True, True),
            "deck_actions":   ALL_DECK_ACTIONS,
            "playlist_perms": ["playlist.view", "playlist.load"],
            "can_announce":   True,
            "can_schedule":   True,
            "can_library":    True,
            "can_requests":   True,
            "can_settings":   False,
        }
    return {
        "allowed_decks":  role_obj.get("default_allowed_decks",  DECK_IDS),
        "deck_control":   role_obj.get("default_deck_control",   _full_deck_control(True, True)),
        "deck_actions":   role_obj.get("default_deck_actions",   ALL_DECK_ACTIONS),
        "playlist_perms": role_obj.get("default_playlist_perms", ["playlist.view", "playlist.load"]),
        "can_announce":   role_obj.get("default_can_announce",   True),
        "can_schedule":   role_obj.get("default_can_schedule",   True),
        "can_library":    role_obj.get("default_can_library",    True),
        "can_requests":   role_obj.get("default_can_requests",   True),
        "can_settings":   role_obj.get("default_can_settings",   False),
    }


def _apply_overrides(perms: dict, req: UserCreateExtendedRequest):
    """Overlay explicit permission overrides from a creation/update request."""
    if req.allowed_decks  is not None: perms["allowed_decks"]  = req.allowed_decks
    if req.deck_control   is not None: perms["deck_control"]   = req.deck_control
    if req.deck_actions   is not None: perms["deck_actions"]   = req.deck_actions
    if req.playlist_perms is not None: perms["playlist_perms"] = req.playlist_perms
    if req.can_announce   is not None: perms["can_announce"]   = req.can_announce
    if req.can_schedule   is not None: perms["can_schedule"]   = req.can_schedule
    if req.can_library    is not None: perms["can_library"]    = req.can_library
    if req.can_requests   is not None: perms["can_requests"]   = req.can_requests
    if req.can_settings   is not None: perms["can_settings"]   = req.can_settings


def _superadmin_effective() -> dict:
    return {
        "allowed_decks":  DECK_IDS,
        "deck_control":   _full_deck_control(True, True),
        "deck_actions":   ALL_DECK_ACTIONS,
        "playlist_perms": ALL_PLAYLIST_PERMS,
        "can_announce":   True,
        "can_schedule":   True,
        "can_library":    True,
        "can_requests":   True,
        "can_settings":   True,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  ROLE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/roles")
async def list_roles(_user: dict = Depends(verify_token)):
    """Return all roles (system + custom). Any authenticated user can read."""
    from db_client import db
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, db.list_roles)


@router.get("/roles/{role_id}")
async def get_role(role_id: str, _user: dict = Depends(verify_token)):
    from db_client import db
    loop = asyncio.get_event_loop()
    role = await loop.run_in_executor(None, db.get_role_by_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("/roles", status_code=201)
async def create_role(
    req: RoleCreateRequest,
    request: Request,
    _user: dict = Depends(require_admin),
):
    """Create a custom role. Admin or super-admin only."""
    from db_client import db

    name = req.name.strip().lower().replace(" ", "_")
    if not name or len(name) > 50:
        raise HTTPException(status_code=400, detail="Role name must be 1–50 characters")

    system_names = {r["name"] for r in SYSTEM_ROLES}
    if name in system_names:
        raise HTTPException(status_code=409, detail=f"'{name}' is a system role and cannot be recreated")

    role_id = str(uuid.uuid4())
    role = {
        "id":                     role_id,
        "name":                   name,
        "display_name":           req.display_name.strip(),
        "description":            req.description or "",
        "color":                  req.color or "#6B7280",
        "is_system":              False,
        "default_allowed_decks":  req.default_allowed_decks if req.default_allowed_decks is not None else DECK_IDS,
        "default_deck_control":   req.default_deck_control  if req.default_deck_control  is not None else _full_deck_control(True, True),
        "default_deck_actions":   req.default_deck_actions  if req.default_deck_actions  is not None else ALL_DECK_ACTIONS,
        "default_playlist_perms": req.default_playlist_perms if req.default_playlist_perms is not None else ["playlist.view", "playlist.load"],
        "default_can_announce":   req.default_can_announce,
        "default_can_schedule":   req.default_can_schedule,
        "default_can_library":    req.default_can_library,
        "default_can_requests":   req.default_can_requests,
        "default_can_settings":   req.default_can_settings,
    }

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, db.create_role, role)
    except Exception as e:
        msg = str(e)
        if "unique" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail="A role with this name already exists")
        raise HTTPException(status_code=500, detail=f"DB error: {msg}")

    _audit(request, _user, "role.create", {"role_name": name})
    return result


@router.put("/roles/{role_id}")
async def update_role(
    role_id: str,
    req: RoleUpdateRequest,
    request: Request,
    _user: dict = Depends(require_admin),
):
    """Update a role's metadata or default permissions."""
    from db_client import db
    loop = asyncio.get_event_loop()
    role = await loop.run_in_executor(None, db.get_role_by_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    fields: Dict[str, Any] = {}
    for attr in (
        "display_name", "description", "color",
        "default_allowed_decks", "default_deck_control", "default_deck_actions",
        "default_playlist_perms", "default_can_announce", "default_can_schedule",
        "default_can_library", "default_can_requests", "default_can_settings",
    ):
        val = getattr(req, attr)
        if val is not None:
            fields[attr] = val

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    await loop.run_in_executor(None, db.update_role, role_id, fields)
    _audit(request, _user, "role.update", {"role_id": role_id, "fields": list(fields.keys())})
    return {"status": "ok"}


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: str,
    request: Request,
    _user: dict = Depends(require_super_admin),
):
    """Delete a custom role. System roles cannot be deleted. Super-admin only."""
    from db_client import db
    loop = asyncio.get_event_loop()

    role = await loop.run_in_executor(None, db.get_role_by_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.get("is_system"):
        raise HTTPException(status_code=403, detail="System roles cannot be deleted")

    # Refuse if users are still assigned to this role
    users = await loop.run_in_executor(None, db.list_users)
    role_name = role["name"]
    in_use = [u["username"] for u in users if u.get("role") == role_name]
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"Role is assigned to {len(in_use)} user(s): {', '.join(in_use[:5])}. "
                   "Reassign them first.",
        )

    await loop.run_in_executor(None, db.delete_role, role_id)
    _audit(request, _user, "role.delete", {"role_id": role_id, "role_name": role_name})
    return {"status": "ok"}


# ── Permission catalogue ───────────────────────────────────────────────────────

@router.get("/permissions/catalogue")
async def get_permission_catalogue(_user: dict = Depends(verify_token)):
    """Return all known permission keys so the frontend can build UI dynamically."""
    return {
        "deck_ids":       DECK_IDS,
        "deck_actions":   ALL_DECK_ACTIONS,
        "playlist_perms": ALL_PLAYLIST_PERMS,
        "feature_flags": [
            "can_announce",
            "can_schedule",
            "can_library",
            "can_requests",
            "can_settings",
        ],
    }


# ══════════════════════════════════════════════════════════════════════════════
#  EXTENDED USER ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/users/extended", status_code=201)
async def create_user_extended(
    req: UserCreateExtendedRequest,
    request: Request,
    _user: dict = Depends(require_admin),
):
    """
    Create a user with full permission control in one request.
    Role can be any name from the roles table (system or custom).
    Admins can create any non-super-admin user.
    Only super-admin can create other admins or super-admins.
    """
    from db_client import db

    loop = asyncio.get_event_loop()
    all_roles = await loop.run_in_executor(None, db.list_roles)
    valid_names = {r["name"] for r in all_roles}

    role = req.role.strip().lower()
    if role not in valid_names:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown role '{role}'. Valid roles: {sorted(valid_names)}",
        )

    if role in ("admin", "super_admin") and not _user.get("is_super_admin"):
        raise HTTPException(
            status_code=403,
            detail="Only super-admin can create admin or super-admin accounts",
        )

    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Build permissions: role defaults → apply any explicit overrides
    role_obj = next((r for r in all_roles if r["name"] == role), None)
    perms = _role_to_perms(role_obj)
    _apply_overrides(perms, req)

    pw_hash = hash_password(req.password)
    user_id = str(uuid.uuid4())

    try:
        user = await loop.run_in_executor(
            None,
            db.create_user,
            user_id,
            req.username.strip(),
            req.display_name or req.username.strip(),
            pw_hash,
            role,
            role == "super_admin",
        )
    except Exception as e:
        msg = str(e)
        if "unique" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail="Username already exists")
        raise HTTPException(status_code=500, detail=f"DB error: {msg}")

    try:
        await loop.run_in_executor(None, db.save_permissions, user_id, perms)
    except Exception as e:
        print(f"[rbac] Failed to save permissions for new user {user_id}: {e}")

    _audit(request, _user, "user.create", {
        "target": req.username,
        "role": role,
        "custom_perms": any(
            getattr(req, f) is not None
            for f in ("allowed_decks", "deck_control", "deck_actions",
                      "playlist_perms", "can_announce", "can_schedule",
                      "can_library", "can_requests", "can_settings")
        ),
    })
    return {k: v for k, v in user.items() if k != "password_hash"}


@router.post("/users/{user_id}/apply-role-template")
async def apply_role_template(
    user_id: str,
    req: ApplyRoleTemplateRequest,
    request: Request,
    _user: dict = Depends(require_admin),
):
    """
    Reset a user's individual permissions to their role's defaults.
    Useful after changing a user's role, or to 'factory reset' their permissions.
    """
    from db_client import db
    loop = asyncio.get_event_loop()

    users = await loop.run_in_executor(None, db.list_users)
    target = next((u for u in users if str(u["id"]) == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    role_name = req.role_name or target.get("role", "operator")
    all_roles = await loop.run_in_executor(None, db.list_roles)
    role_obj = next((r for r in all_roles if r["name"] == role_name), None)
    if not role_obj:
        raise HTTPException(status_code=404, detail=f"Role '{role_name}' not found")

    perms = _role_to_perms(role_obj)
    await loop.run_in_executor(None, db.save_permissions, user_id, perms)
    _audit(request, _user, "user.apply_role_template", {
        "target_id": user_id,
        "role_name": role_name,
    })
    return {"status": "ok", "applied_role": role_name, "permissions": perms}


@router.get("/users/{user_id}/effective-permissions")
async def get_effective_permissions(
    user_id: str,
    _user: dict = Depends(verify_token),
):
    """
    Returns merged effective permissions for a user.
    Operators can only view their own. Admins can view any.
    """
    is_self = _user.get("sub") == user_id
    if not is_self and not _is_elevated(_user):
        raise HTTPException(status_code=403, detail="Access denied")

    from db_client import db
    loop = asyncio.get_event_loop()

    users = await loop.run_in_executor(None, db.list_users)
    target = next((u for u in users if str(u["id"]) == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("is_super_admin") or target.get("role") == "super_admin":
        return {"user_id": user_id, "username": target["username"],
                "role": target.get("role"), **_superadmin_effective()}

    perms = await loop.run_in_executor(None, db.get_permissions, user_id)
    return {"user_id": user_id, "username": target["username"],
            "role": target.get("role"), **perms}
