import os
import jwt
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

DB_MODE = os.getenv("DB_MODE", "local").lower()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "") # Usually found in Supabase API settings

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    if DB_MODE == "local":
        # In local mode, bypass full auth or implement simple token check
        # For simplicity, returning a dummy admin profile
        return {"role": "admin", "uid": "local-admin"}
    
    token = credentials.credentials
    try:
        # Supabase signs with HS256 and the JWT secret
        decoded = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], options={"verify_aud": False})
        
        # In a real app, query 'profiles' table here to get the role if it's not in the JWT claims
        # For now, we assume everyone logging in is admin unless specified
        role = decoded.get("user_metadata", {}).get("role", "admin")
        
        return {"role": role, "uid": decoded.get("sub")}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_admin(user=Depends(verify_token)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required")
    return user
