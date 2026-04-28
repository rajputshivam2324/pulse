"""
Pulse API — Main FastAPI Application
AI-Powered Product Analytics for Solana Founders
"""

import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load environment variables before importing anything else
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analytics, webhooks, insights


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler — startup/shutdown logic."""
    print("🚀 Pulse API starting up...")
    yield
    # Gracefully close Redis connection pool
    from services.cache import close_redis
    await close_redis()
    print("🛑 Pulse API shutting down...")


app = FastAPI(
    title="Pulse API",
    description="AI-Powered Product Analytics for Solana Founders",
    version="0.1.0",
    lifespan=lifespan,
)

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
    """Root endpoint — health check."""
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
