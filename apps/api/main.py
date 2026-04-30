"""
Pulse API — Main FastAPI Application
AI-Powered Product Analytics for Solana Founders
"""

import os
import logging
import structlog
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load environment variables before importing anything else
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from routers import analytics, webhooks, insights
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


# ─── Rate Limiter ───────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler — startup/shutdown logic."""
    log.info("pulse_api_starting", version="0.1.0")

    # Initialize Redis client eagerly in the lifespan (not lazily on first request)
    import redis.asyncio as redis
    redis_client = redis.from_url(
        os.getenv("UPSTASH_REDIS_URL", "redis://localhost:6379"),
        decode_responses=False,
    )
    inject_redis(redis_client)
    log.info("redis_connected")

    # Test Redis connection
    try:
        await redis_client.ping()
        log.info("redis_health_ok")
    except Exception as e:
        log.warning("redis_health_check_failed", error=str(e))

    yield

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
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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


# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Mount routers
app.include_router(analytics.router)
app.include_router(webhooks.router)
app.include_router(insights.router)


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