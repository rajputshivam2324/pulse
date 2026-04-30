"""
JWT Authentication Middleware for Pulse API.
Verifies Bearer tokens on protected routes.
"""

import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from typing import Optional

security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")
JWT_ALGORITHM = "HS256"


async def get_current_wallet(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    """
    Extract and verify the wallet address from a JWT Bearer token.
    Returns None if no token is provided (allows unauthenticated access for dev).
    Raises 401 if token is present but invalid.
    """
    if credentials is None:
        return None

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )
        wallet: str = payload.get("wallet")
        if not wallet:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: no wallet claim",
            )
        return wallet
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def require_auth(
    wallet: Optional[str] = Depends(get_current_wallet),
) -> str:
    """
    Strict auth dependency — requires a valid JWT.
    Use this on endpoints that must be authenticated.
    """
    if wallet is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer token.",
        )
    return wallet
