import os
from typing import Optional
from fastapi import Request, HTTPException
from jose import jwt, JWTError

JWT_SECRET = os.environ.get("JWT_SECRET", "pulse-jwt-secret-dev-only")

def require_auth(request: Request) -> str:
    """
    Middleware that verifies the JWT from the Authorization header.
    Returns the wallet_pubkey (sub) from the token.
    Raises 401 if missing, invalid, or expired.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split(" ")[1]
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        wallet = payload.get("sub")
        if not wallet:
            raise HTTPException(status_code=401, detail="Token payload missing 'sub'")
        return wallet
    except JWTError:
        raise HTTPException(status_code=401, detail="Token is invalid or expired")

def resolve_wallet_to_user_id(wallet_pubkey: str) -> Optional[str]:
    """
    Resolves any wallet pubkey to its primary user_id.
    1. Checks if the wallet is a secondary wallet in linked_wallets.
    2. Checks if the wallet is a primary wallet in users.
    Returns the user_id (UUID string) or None.
    """
    from services.supabase import get_supabase
    supabase = get_supabase()

    # 1. Check linked wallets first
    linked_res = supabase.table("linked_wallets").select("user_id").eq("wallet_pubkey", wallet_pubkey).execute()
    if linked_res.data:
        return linked_res.data[0]["user_id"]

    # 2. Check primary users table
    users_res = supabase.table("users").select("id").eq("wallet_pubkey", wallet_pubkey).execute()
    if users_res.data:
        return users_res.data[0]["id"]

    return None
