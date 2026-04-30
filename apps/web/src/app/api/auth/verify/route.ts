import { NextRequest, NextResponse } from 'next/server'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import * as jose from 'jose'
import { createClient } from 'redis'

/**
 * SIWS Signature verification + JWT issuance.
 * Verifies the signed nonce message and returns a JWT.
 * Validates nonce from Redis (or in-memory fallback).
 *
 * Fix #5: Require JWT_SECRET env var — no insecure defaults.
 * Fix #11: Set `sub` claim to wallet address for cross-service compatibility.
 * Fix #12: Validate nonce in both Redis and in-memory fallback paths.
 * Fix #19: Reuse Redis connection properly.
 */

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(secret)
}

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
  try {
    const { wallet, signature, nonce } = await req.json()

    if (!wallet || !signature || !nonce) {
      return NextResponse.json(
        { error: 'Missing wallet, signature, or nonce' },
        { status: 400 }
      )
    }

    // Validate nonce from Redis or in-memory fallback
    const redis = await getRedis()
    if (redis) {
      const storedNonce = await redis.get(`nonce:${wallet}`)
      if (!storedNonce || storedNonce !== nonce) {
        return NextResponse.json(
          { error: 'Invalid or expired nonce' },
          { status: 401 }
        )
      }
      // Delete used nonce (one-time use)
      await redis.del(`nonce:${wallet}`)
    } else {
      // Fallback: validate against in-memory store
      const stored = nonceStoreFallback.get(wallet)
      if (!stored || stored.nonce !== nonce || stored.expires < Date.now()) {
        return NextResponse.json(
          { error: 'Invalid or expired nonce' },
          { status: 401 }
        )
      }
      // Delete used nonce (one-time use)
      nonceStoreFallback.delete(wallet)
    }

    // Reconstruct the message that was signed
    const message = new TextEncoder().encode(
      `Sign in to Pulse\n\nWallet: ${wallet}\nNonce: ${nonce}\n\nThis will not trigger any blockchain transaction.`
    )

    // Verify signature using tweetnacl
    const valid = nacl.sign.detached.verify(
      message,
      new Uint8Array(signature),
      bs58.decode(wallet)
    )

    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Generate JWT using jose (Edge-compatible)
    // Fix #11: Set `sub` to wallet so both frontend and backend read the same claim
    const token = await new jose.SignJWT({ wallet })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(wallet)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(getJwtSecret())

    return NextResponse.json({ token })
  } catch (error) {
    console.error('Auth verification error:', error)
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    )
  }
}
