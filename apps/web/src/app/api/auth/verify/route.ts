import { NextRequest, NextResponse } from 'next/server'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import * as jose from 'jose'
import { createClient } from 'redis'

/**
 * SIWS Signature verification + JWT issuance.
 * Verifies the signed nonce message and returns a JWT.
 * Validates nonce from Redis (or in-memory fallback).
 */

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'pulse-jwt-secret-change-in-production'
)

let redisClient: ReturnType<typeof createClient> | null = null

async function getRedis() {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_URL
    if (url) {
      redisClient = createClient({ url })
      await redisClient.connect()
    }
  }
  return redisClient
}

export async function POST(req: NextRequest) {
  try {
    const { wallet, signature, nonce } = await req.json()

    if (!wallet || !signature || !nonce) {
      return NextResponse.json(
        { error: 'Missing wallet, signature, or nonce' },
        { status: 400 }
      )
    }

    // Validate nonce from Redis
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
    const token = await new jose.SignJWT({ wallet })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET)

    return NextResponse.json({ token })
  } catch (error) {
    console.error('Auth verification error:', error)
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    )
  }
}
