"""
auth.py — CocoStation Authentication
======================================
JWT-based auth with bcrypt password hashing + optional LDAP.
Default credentials: cocoadmin / Coco@coco (seeded by migrate.py)
"""

import os
from datetime import datetime, timedelta
from typing import Optional

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
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── LDAP Authentication ───────────────────────────────────────

def verify_ldap_credentials(username: str, password: str, ldap_cfg: dict) -> Optional[dict]:
    """
    Try to authenticate username/password against an LDAP/AD server.
    Returns a user-info dict on success, None on failure.

    ldap_cfg keys:
      server      — e.g. "ldap://192.168.1.10" or "ldaps://dc.company.com"
      port        — int, default 389 (636 for LDAPS)
      base_dn     — e.g. "dc=company,dc=com"
      bind_dn     — service account DN, e.g. "cn=svc,dc=company,dc=com"
      bind_pw     — service account password
      user_filter — LDAP filter, e.g. "(sAMAccountName={username})"
      attr_email  — attribute name for email  (default: mail)
      attr_name   — attribute name for display name (default: cn)
      role_admin_group — DN of group whose members get role=admin (optional)
      use_ssl     — bool
      tls_verify  — bool (set False for self-signed certs)
    """
    try:
        from ldap3 import Server, Connection, ALL, NTLM, SIMPLE, Tls
        import ssl

        server_url = ldap_cfg.get("server", "")
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

        # Step 1 — bind with service account to search
        if bind_dn and bind_pw:
            conn = Connection(srv, user=bind_dn, password=bind_pw, auto_bind=True)
        else:
            conn = Connection(srv, auto_bind=True)  # anonymous bind

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

        # Step 2 — bind as the user to verify password
        user_conn = Connection(srv, user=user_dn, password=password, auto_bind=True)
        user_conn.unbind()

        # Step 3 — determine role
        role = "operator"
        if admin_group:
            member_of = [str(g) for g in entry.memberOf] if hasattr(entry, "memberOf") else []
            if admin_group.lower() in [g.lower() for g in member_of]:
                role = "admin"

        display_name = str(entry[attr_name]) if hasattr(entry, attr_name) else username
        email        = str(entry[attr_email]) if hasattr(entry, attr_email) else ""

        print(f"[ldap] Authenticated '{username}' from LDAP (role={role})")
        return {
            "id":           f"ldap-{username}",   # synthetic ID for LDAP users
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
    """
    Test LDAP server connectivity and service-account bind.
    Returns {"ok": True/False, "detail": str}
    """
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

        # Count users visible from base_dn
        conn.search(base_dn, "(objectClass=person)", attributes=["cn"])
        count = len(conn.entries)
        conn.unbind()

        return {"ok": True, "detail": f"Connected. {count} object(s) visible under base DN."}
    except Exception as e:
        return {"ok": False, "detail": str(e)}
