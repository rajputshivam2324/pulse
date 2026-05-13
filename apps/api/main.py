"""
Pulse API — Main FastAPI Application
AI-Powered Product Analytics for Solana Founders
"""

import asyncio
import os
import re
import logging
import structlog
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables before importing anything else (works when cwd is not apps/api)
_api_dir = Path(__file__).resolve().parent
load_dotenv(_api_dir / ".env")
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from services.rate_limit import limiter
from slowapi.util import get_remote_address
from routers import analytics, webhooks, insights, user
from services.cache import inject_redis, close_redis

# ─── Structured Logging ────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)
log = structlog.get_logger()


# Shared Rate Limiter is imported from services.rate_limit

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler — startup/shutdown logic."""
    log.info("pulse_api_starting", version="0.1.0")

    # Check AI layer configuration
    from services.ai.nodes import check_ai_health
    ai_health = check_ai_health()
    if ai_health["status"] == "configured":
        log.info("ai_layer_configured", model=ai_health["model"])
    else:
        log.warning("ai_layer_unconfigured", error=ai_health.get("error"))

    # Initialize Redis client eagerly in the lifespan (not lazily on first request)
    import redis.asyncio as redis
    redis_client = redis.from_url(
        os.getenv("UPSTASH_REDIS_URL", "redis://localhost:6379"),
        decode_responses=True,
    )
    inject_redis(redis_client)
    log.info("redis_connected")

    # Test Redis connection
    try:
        await redis_client.ping()
        log.info("redis_health_ok")
    except Exception as e:
        log.warning("redis_health_check_failed", error=str(e))

    worker_task: asyncio.Task | None = None
    if os.getenv("PULSE_SYNC_WORKER_ENABLED", "true").lower() in ("1", "true", "yes"):
        from services.sync_worker import run_sync_worker_task

        worker_task = asyncio.create_task(run_sync_worker_task(), name="pulse_sync_worker")
        log.info("sync_worker_started")

    yield

    if worker_task:
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
        log.info("sync_worker_stopped")

    # Graceful shutdown
    await close_redis()
    log.info("pulse_api_shutdown")


app = FastAPI(
    title="Pulse API",
    description="AI-Powered Product Analytics for Solana Founders",
    version="0.1.0",
    lifespan=lifespan,
)

# Attach rate limiter to app state
app.state.limiter = limiter

# ── Middleware ────────────────────────────────────────────────────────────
# Structured request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    log.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(duration_ms, 2),
        client_ip=get_remote_address(request),
    )
    return response


# CORS — allow Next.js frontend. Set on the API host (EC2), not only on Vercel.
# FRONTEND_URL: comma-separated exact origins (no spaces around =). Examples:
#   FRONTEND_URL=https://pulse.shivamio.in
#   FRONTEND_URL=https://pulse.shivamio.in,https://pulse.vercel.app
# Optional FRONTEND_ORIGIN_REGEX for all Vercel previews, e.g.:
#   FRONTEND_ORIGIN_REGEX=https://.*\.vercel\.app
_IPV4_HOST = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


def _origin_apex_www_variants(origin: str) -> list[str]:
    """
    Browsers send exactly one Origin. If the user opens www but env has apex (or the reverse),
    CORS fails unless both are allowed. Skip for localhost and raw IPs.
    """
    origin = origin.strip().rstrip("/")
    if not origin.startswith(("http://", "https://")):
        return [origin]
    from urllib.parse import urlparse

    p = urlparse(origin)
    host = (p.hostname or "").lower()
    if not host or host in ("localhost", "127.0.0.1") or _IPV4_HOST.match(host):
        return [origin]
    port = f":{p.port}" if p.port else ""
    out = [origin]
    if host.startswith("www."):
        bare = host[4:]
        out.append(f"{p.scheme}://{bare}{port}")
    else:
        out.append(f"{p.scheme}://www.{host}{port}")
    return list(dict.fromkeys(out))


def _cors_origins() -> list[str]:
    base = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]
    raw = (os.getenv("FRONTEND_URL") or "http://localhost:3000").strip()
    extra: list[str] = []
    for part in raw.split(","):
        part = part.strip().rstrip("/")
        if not part:
            continue
        for v in _origin_apex_www_variants(part):
            if v not in extra:
                extra.append(v)
    seen = set(base)
    out = list(base)
    for o in extra:
        if o not in seen:
            seen.add(o)
            out.append(o)
    return out


_cors_regex = os.getenv("FRONTEND_ORIGIN_REGEX", "").strip() or None


def _cors_reflect_headers(request: Request) -> dict[str, str]:
    """
    SlowAPI's 429 JSONResponse does not pass through CORSMiddleware response hooks the same way,
    so browsers report a bogus 'CORS error' instead of rate limit. Reflect allowed Origin here.
    """
    origin = request.headers.get("origin")
    if not origin:
        return {}
    allowed = _cors_origins()
    normalized = {a.rstrip("/") for a in allowed}
    origin_base = origin.rstrip("/")
    if origin_base in normalized or origin in allowed:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    if _cors_regex:
        try:
            if re.fullmatch(_cors_regex, origin):
                return {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Credentials": "true",
                    "Vary": "Origin",
                }
        except re.error:
            pass
    return {}


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    response = _rate_limit_exceeded_handler(request, exc)
    for key, val in _cors_reflect_headers(request).items():
        response.headers[key] = val
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# Mount routers
app.include_router(analytics.router)
app.include_router(webhooks.router)
app.include_router(insights.router)
app.include_router(user.router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Pulse API",
        "version": "0.1.0",
        "status": "running",
        "description": "AI-Powered Product Analytics for Solana Founders",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "version": "0.1.0"}


# ── Sentry Error Handler ──────────────────────────────────────────────────
sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(dsn=sentry_dsn, traces_sample_rate=0.1)
    @app.exception_handler(Exception)
    async def sentry_handler(request: Request, exc: Exception):
        sentry_sdk.capture_exception(exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )