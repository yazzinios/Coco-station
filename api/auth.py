"""
auth.py — CocoStation Authentication
======================================
JWT-based auth with bcrypt password hashing + optional LDAP.
Default credentials: cocoadmin / Coco@coco (seeded by migrate.py)
"""

import os
from datetime import datetime, timedelta
from typing import Optional, List

import bcrypt
from jose import jwt, JWTError
from fastapi import HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ── Config ───────────────────────────────────────────────────
JWT_SECRET       = os.getenv("JWT_SECRET", "cocostation-jwt-secret-change-me-in-prod")
JWT_ALGORITHM    = "HS256"
DEFAULT_EXPIRY_HOURS = 8

security = HTTPBearer(auto_error=False)


# ── Password helpers ─────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── Token helpers ─────────────────────────────────────────────

def create_token(user: dict, expiry_hours: int = DEFAULT_EXPIRY_HOURS) -> str:
    """Create a signed JWT for the given user dict."""
    expire = datetime.utcnow() + timedelta(hours=expiry_hours)
    payload = {
        "sub":            str(user["id"]),
        "username":       user["username"],
        "role":           user.get("role", "operator"),
        "is_super_admin": bool(user.get("is_super_admin", False)),
        "exp":            expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises 401 on failure."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {exc}")


# ── FastAPI dependencies ──────────────────────────────────────

def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """HTTP Bearer dependency — used on protected REST endpoints."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header required")
    return decode_token(credentials.credentials)


def verify_token_ws(token: Optional[str] = Query(None)) -> dict:
    """Query-param token dependency — used on WebSocket endpoints."""
    if not token:
        raise HTTPException(status_code=401, detail="Token query-param required")
    return decode_token(token)


def require_admin(user: dict = Depends(verify_token)) -> dict:
    if user.get("role") != "admin" and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_super_admin(user: dict = Depends(verify_token)) -> dict:
    if not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Super-admin access required")
    return user


def require_role(*roles):
    """
    FastAPI dependency factory — restricts to specific role names.
    Super-admins always pass. Usage:
        @app.post("/api/something")
        async def handler(user = Depends(require_role("admin", "operator"))):
    """
    async def _check(user: dict = Depends(verify_token)) -> dict:
        if user.get("is_super_admin"):
            return user
        if user.get("role") not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Requires one of: {', '.join(roles)}",
            )
        return user
    return _check


def is_elevated(user: dict) -> bool:
    """Returns True if user is admin or super_admin — bypasses per-permission checks."""
    return user.get("role") == "admin" or bool(user.get("is_super_admin"))


# ── Permission checker dependency factory ────────────────────

def require_permission(perm: str):
    """
    FastAPI dependency factory. Usage:
        @app.post("/api/decks/{id}/play")
        async def play_deck(id: str, user = Depends(require_permission("deck.play"))):
            ...
    Admins and super-admins always pass. For operators, the permission must be
    present in their granted deck_actions or playlist_perms list.
    """
    async def _check(user: dict = Depends(verify_token)) -> dict:
        if is_elevated(user):
            return user
        # For operators: permission list is loaded from the DB on each call.
        # This keeps the check stateless per-request.
        try:
            from db_client import db
            import asyncio
            loop = asyncio.get_event_loop()
            perms = await loop.run_in_executor(None, db.get_permissions, user["sub"])
            granted = (perms.get("deck_actions") or []) + (perms.get("playlist_perms") or [])
            if perm not in granted:
                raise HTTPException(
                    status_code=403,
                    detail=f"Permission denied: '{perm}' not granted for this user"
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Permission check failed: {e}")
        return user
    return _check


# ── Deck access checker ───────────────────────────────────────

def require_deck_access(level: str = "view"):
    """
    FastAPI dependency factory for deck-level view/control access.
    level = "view" | "control"
    The deck_id must be a path param named 'deck_id'.
    """
    async def _check(deck_id: str, user: dict = Depends(verify_token)) -> dict:
        if is_elevated(user):
            return user
        try:
            from db_client import db
            import asyncio
            loop = asyncio.get_event_loop()
            perms = await loop.run_in_executor(None, db.get_permissions, user["sub"])
            deck_control = perms.get("deck_control") or {}
            deck_cfg = deck_control.get(deck_id.lower(), {})
            if level == "control" and not deck_cfg.get("control", False):
                raise HTTPException(status_code=403, detail=f"No control access for Deck {deck_id.upper()}")
            if level == "view" and not deck_cfg.get("view", True):
                raise HTTPException(status_code=403, detail=f"No view access for Deck {deck_id.upper()}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Deck access check failed: {e}")
        return user
    return _check


# ── LDAP Authentication ───────────────────────────────────────

def verify_ldap_credentials(username: str, password: str, ldap_cfg: dict) -> Optional[dict]:
    """
    Try to authenticate username/password against an LDAP/AD server.
    Returns a user-info dict on success, None on failure.
    """
    try:
        from ldap3 import Server, Connection, ALL, Tls
        import ssl

        server_url = ldap_cfg.get("server", "")
        if not server_url or not server_url.strip():
            print(f"[ldap] No LDAP server configured, skipping")
            return None
        port       = int(ldap_cfg.get("port", 389))
        base_dn    = ldap_cfg.get("base_dn", "")
        bind_dn    = ldap_cfg.get("bind_dn", "")
        bind_pw    = ldap_cfg.get("bind_pw", "")
        user_filter= ldap_cfg.get("user_filter", "(sAMAccountName={username})").replace("{username}", username)
        attr_name  = ldap_cfg.get("attr_name",  "cn")
        attr_email = ldap_cfg.get("attr_email", "mail")
        admin_group= ldap_cfg.get("role_admin_group", "")
        use_tls    = ldap_cfg.get("use_ssl", False)
        tls_verify = ldap_cfg.get("tls_verify", True)

        tls = None
        if use_tls and not tls_verify:
            tls = Tls(validate=ssl.CERT_NONE)

        srv = Server(server_url, port=port, get_info=ALL, tls=tls, connect_timeout=5)

        if bind_dn and bind_pw:
            conn = Connection(srv, user=bind_dn, password=bind_pw, auto_bind=True)
        else:
            conn = Connection(srv, auto_bind=True)

        conn.search(
            search_base=base_dn,
            search_filter=user_filter,
            attributes=[attr_name, attr_email, "memberOf", "userAccountControl"],
        )

        if not conn.entries:
            print(f"[ldap] User '{username}' not found in directory")
            conn.unbind()
            return None

        entry    = conn.entries[0]
        user_dn  = entry.entry_dn
        conn.unbind()

        user_conn = Connection(srv, user=user_dn, password=password, auto_bind=True)
        user_conn.unbind()

        role = "operator"
        if admin_group:
            try:
                raw_member_of = entry["memberOf"].values if hasattr(entry["memberOf"], "values") else []
                member_of = [str(g) for g in raw_member_of]
            except Exception:
                member_of = []
            if admin_group.lower() in [g.lower() for g in member_of]:
                role = "admin"

        try:
            display_name = str(entry[attr_name]) if attr_name in entry else username
        except Exception:
            display_name = username
        try:
            email = str(entry[attr_email]) if attr_email in entry else ""
        except Exception:
            email = ""

        print(f"[ldap] Authenticated '{username}' from LDAP (role={role})")
        return {
            "id":           f"ldap-{username}",
            "username":     username,
            "display_name": display_name,
            "email":        email,
            "role":         role,
            "source":       "ldap",
        }

    except Exception as e:
        print(f"[ldap] Authentication error for '{username}': {e}")
        return None


def test_ldap_connection(ldap_cfg: dict) -> dict:
    try:
        from ldap3 import Server, Connection, ALL, Tls
        import ssl

        server_url = ldap_cfg.get("server", "")
        port       = int(ldap_cfg.get("port", 389))
        bind_dn    = ldap_cfg.get("bind_dn", "")
        bind_pw    = ldap_cfg.get("bind_pw", "")
        base_dn    = ldap_cfg.get("base_dn", "")
        use_tls    = ldap_cfg.get("use_ssl", False)
        tls_verify = ldap_cfg.get("tls_verify", True)

        tls = None
        if use_tls and not tls_verify:
            tls = Tls(validate=ssl.CERT_NONE)

        srv  = Server(server_url, port=port, get_info=ALL, tls=tls, connect_timeout=5)
        conn = Connection(srv, user=bind_dn, password=bind_pw, auto_bind=True)

        conn.search(base_dn, "(objectClass=person)", attributes=["cn"])
        count = len(conn.entries)
        conn.unbind()

        return {"ok": True, "detail": f"Connected. {count} object(s) visible under base DN."}
    except Exception as e:
        return {"ok": False, "detail": str(e)}


def query_ldap_directory(ldap_cfg: dict) -> dict:
    """Connect to LDAP and return user_count + list of group names.
    Used by the Directory Stats panel in Settings.
    Returns: { user_count: int, group_count: int, groups: [str], error: str|None }
    """
    try:
        from ldap3 import Server, Connection, ALL, Tls, SUBTREE
        import ssl

        server_url = ldap_cfg.get("server", "")
        port       = int(ldap_cfg.get("port", 389))
        bind_dn    = ldap_cfg.get("bind_dn", "")
        bind_pw    = ldap_cfg.get("bind_pw", "")
        base_dn    = ldap_cfg.get("base_dn", "")
        use_tls    = ldap_cfg.get("use_ssl", False)
        tls_verify = ldap_cfg.get("tls_verify", True)

        tls = None
        if use_tls and not tls_verify:
            tls = Tls(validate=ssl.CERT_NONE)

        srv  = Server(server_url, port=port, get_info=ALL, tls=tls, connect_timeout=8)
        conn = Connection(srv, user=bind_dn, password=bind_pw, auto_bind=True)

        # ── Count users (objectClass=person covers AD + OpenLDAP) ──
        conn.search(
            search_base=base_dn,
            search_filter="(objectClass=person)",
            search_scope=SUBTREE,
            attributes=["cn"],
            paged_size=1000,
        )
        user_count = len(conn.entries)

        # ── Fetch groups ──
        # Try AD-style group first, then fall back to posixGroup / groupOfNames
        groups = []
        for group_filter in [
            "(objectClass=group)",
            "(objectClass=groupOfNames)",
            "(objectClass=posixGroup)",
        ]:
            conn.search(
                search_base=base_dn,
                search_filter=group_filter,
                search_scope=SUBTREE,
                attributes=["cn", "name"],
                paged_size=200,
            )
            if conn.entries:
                for entry in conn.entries:
                    name = None
                    if hasattr(entry, 'cn') and entry.cn.value:
                        name = str(entry.cn.value)
                    elif hasattr(entry, 'name') and entry.name.value:
                        name = str(entry.name.value)
                    if name and name not in groups:
                        groups.append(name)
                break  # found groups with this filter, stop trying others

        groups.sort(key=str.lower)
        conn.unbind()

        return {
            "user_count":  user_count,
            "group_count": len(groups),
            "groups":      groups,
            "error":       None,
        }
    except Exception as e:
        return {
            "user_count":  None,
            "group_count": None,
            "groups":      [],
            "error":       str(e),
        }
