import os
import jwt
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# auto_error=False lets FastAPI pass None when no Authorization header is present,
# instead of auto-returning 401. Our code then decides what to do.
security = HTTPBearer(auto_error=False)

DB_MODE = os.getenv("DB_MODE", "local").lower()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")


def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    # ── Local mode: bypass auth entirely ──────────────────────
    if DB_MODE == "local":
        return {"role": "admin", "uid": "local-admin"}

    # ── Cloud mode: require a valid Supabase JWT ───────────────
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header required")

    token = credentials.credentials
    try:
        decoded = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        role = decoded.get("user_metadata", {}).get("role", "admin")
        return {"role": role, "uid": decoded.get("sub")}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_admin(user=Depends(verify_token)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required")
    return user
