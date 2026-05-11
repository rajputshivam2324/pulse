from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request
import base64
import json


def _extract_sub_from_bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    parts = token.split(".")
    if len(parts) < 2:
        return None
    payload = parts[1]
    # Base64 URL-safe decode with padding.
    padding = "=" * ((4 - len(payload) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload + padding).decode("utf-8")
        data = json.loads(decoded)
        sub = data.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None


def key_func(request: Request) -> str:
    # Prefer authenticated wallet subject to avoid shared NAT collisions.
    sub = _extract_sub_from_bearer(request)
    if sub:
        return f"user:{sub}"
    return f"ip:{get_remote_address(request)}"


# Shared rate limiter instance
limiter = Limiter(key_func=key_func)
