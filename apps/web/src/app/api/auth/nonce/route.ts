import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from 'redis'

/**
 * Nonce generation for SIWS authentication.
 * Returns a random nonce that gets signed by the wallet.
 * Uses Upstash Redis for nonce storage (production-safe, shared across instances).
 *
 * Fix #19: Reuse Redis connection and add error handler.
 */

let redisClient: ReturnType<typeof createClient> | null = null

async function getRedis() {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_URL
    if (url) {
      redisClient = createClient({ url })
      redisClient.on('error', (err) => console.error('Redis client error:', err))
      await redisClient.connect()
    }
  }
  return redisClient
}

// Fallback in-memory store for local dev when Redis is not configured
const nonceStoreFallback = new Map<string, { nonce: string; expires: number }>()

export async function POST(req: NextRequest) {
  const { wallet } = await req.json()

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
  }

  // Generate random nonce
  const nonce = crypto.randomBytes(32).toString('hex')
  const ttlSeconds = 5 * 60 // 5 minutes

  const redis = await getRedis()
  if (redis) {
    // Store in Redis with TTL
    await redis.setEx(`nonce:${wallet}`, ttlSeconds, nonce)
  } else {
    // Fallback: in-memory (local dev only)
    nonceStoreFallback.set(wallet, { nonce, expires: Date.now() + ttlSeconds * 1000 })
    // Clean up expired nonces
    for (const [key, value] of nonceStoreFallback) {
      if (value.expires < Date.now()) {
        nonceStoreFallback.delete(key)
      }
    }
  }

  return NextResponse.json({ nonce })
}
