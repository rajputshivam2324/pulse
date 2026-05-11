import { NextRequest, NextResponse } from 'next/server'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import * as jose from 'jose'
import { getRedis } from '@/lib/redis'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(secret)
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  return createClient(url, key)
}

/**
 * Extract and verify JWT from Authorization header to get the current user_id.
 */
async function verifyAuthAndGetUserId(request: NextRequest, supabase: SupabaseClient): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret())
    const wallet = (payload.sub as string) || (payload.wallet as string)
    if (!wallet) return null

    // Resolve primary wallet to user_id
    // 1. Check linked wallets
    const linkedRes = await supabase
      .from('linked_wallets')
      .select('user_id')
      .eq('wallet_pubkey', wallet)
      .maybeSingle()

    const linked = linkedRes.data as { user_id: string } | null
    if (linked?.user_id) return linked.user_id

    // 2. Check primary users
    const primaryRes = await supabase
      .from('users')
      .select('id')
      .eq('wallet_pubkey', wallet)
      .maybeSingle()

    const primary = primaryRes.data as { id: string } | null
    if (primary?.id) return primary.id

    return null
  } catch (err) {
    return null
  }
}

// Fallback in-memory store for local dev when Redis is not configured
const nonceStoreFallback = new Map<string, { nonce: string; expires: number }>()

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    
    // 1. Authenticate the CURRENT user who wants to link a wallet
    const currentUserId = await verifyAuthAndGetUserId(req, supabase)
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized - valid JWT required' }, { status: 401 })
    }

    const { wallet, signature, nonce } = await req.json()

    if (!wallet || !signature || !nonce) {
      return NextResponse.json({ error: 'Missing wallet, signature, or nonce' }, { status: 400 })
    }

    // 2. Rate Limiting via Redis (e.g. 5 attempts/hour)
    const redis = await getRedis()
    if (redis) {
      const rlKey = `rate_limit:link:${currentUserId}`
      const attempts = await redis.incr(rlKey)
      if (attempts === 1) await redis.expire(rlKey, 3600)
      if (attempts > 5) {
        return NextResponse.json({ error: 'Too many link attempts. Try again later.' }, { status: 429 })
      }
    }

    // 3. Verify Nonce (Replay protection)
    if (redis) {
      const storedNonce = await redis.get(`nonce:${wallet}`)
      if (!storedNonce || storedNonce !== nonce) {
        return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401 })
      }
      await redis.del(`nonce:${wallet}`) // Atomic consume
    } else {
      const stored = nonceStoreFallback.get(wallet)
      if (!stored || stored.nonce !== nonce || stored.expires < Date.now()) {
        return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401 })
      }
      nonceStoreFallback.delete(wallet)
    }

    // 4. Reconstruct the message that was signed
    // Must use the primary wallet_pubkey (not UUID) — matches what the frontend signed
    const { data: primaryUser } = await supabase
      .from('users')
      .select('wallet_pubkey')
      .eq('id', currentUserId)
      .single()
    
    if (!primaryUser) {
      return NextResponse.json({ error: 'Primary user not found' }, { status: 400 })
    }

    const message = new TextEncoder().encode(
      `Sign to link wallet to Pulse\n\nUser ID: ${primaryUser.wallet_pubkey}\nWallet: ${wallet}\nNonce: ${nonce}\n\nThis will not trigger any blockchain transaction.`
    )

    // 5. Verify Signature
    const valid = nacl.sign.detached.verify(
      message,
      new Uint8Array(signature),
      bs58.decode(wallet)
    )

    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // 6. DB Checks & Insert
    // e. Check pubkey not already in users.wallet_pubkey (enforced by trigger/logic)
    const { data: primaryCheck } = await supabase.from('users').select('id').eq('wallet_pubkey', wallet).single()
    if (primaryCheck) {
      return NextResponse.json({ error: 'Wallet is already a primary account' }, { status: 400 })
    }

    // e2. Check pubkey not already linked
    const { data: linkedCheck } = await supabase.from('linked_wallets').select('id').eq('wallet_pubkey', wallet).single()
    if (linkedCheck) {
      return NextResponse.json({ error: 'Wallet is already linked to an account' }, { status: 400 })
    }

    // f. Insert into linked_wallets
    const { error: insertErr } = await supabase.from('linked_wallets').insert({
      user_id: currentUserId,
      wallet_pubkey: wallet
    })

    if (insertErr) {
      console.error('Failed to insert linked wallet:', insertErr)
      return NextResponse.json({ error: 'Failed to link wallet (limit may be reached)' }, { status: 400 })
    }

    // i. Insert audit log
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const ua = req.headers.get('user-agent') || 'unknown'
    await supabase.from('wallet_audit_log').insert({
      user_id: currentUserId,
      action: 'link',
      wallet_pubkey: wallet,
      ip_address: ip,
      user_agent: ua
    })

    return NextResponse.json({ success: true, wallet }, { status: 201 })
  } catch (error) {
    console.error('Wallet linking error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
