"""
auth.py — CocoStation Authentication
======================================
JWT-based auth with bcrypt password hashing.
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
JWT_SECRET    = os.getenv("JWT_SECRET", "cocostation-jwt-secret-change-me-in-prod")
JWT_ALGORITHM = "HS256"
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
        "sub":      str(user["id"]),
        "username": user["username"],
        "role":     user.get("role", "operator"),
        "exp":      expire,
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
