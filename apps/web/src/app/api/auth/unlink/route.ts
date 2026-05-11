import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as jose from 'jose'
import type { SupabaseClient } from '@supabase/supabase-js'

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(secret)
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  return createClient(url, key)
}

async function verifyAuthAndGetUserId(request: NextRequest, supabase: SupabaseClient): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret())
    const wallet = (payload.sub as string) || (payload.wallet as string)
    if (!wallet) return null

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

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    
    // 1. Authenticate the CURRENT user who wants to unlink a wallet
    const currentUserId = await verifyAuthAndGetUserId(req, supabase)
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized - valid JWT required' }, { status: 401 })
    }

    const { wallet_to_unlink } = await req.json()

    if (!wallet_to_unlink) {
      return NextResponse.json({ error: 'Missing wallet_to_unlink' }, { status: 400 })
    }

    // Delete the linked wallet ONLY IF it belongs to the current user
    const { error: deleteErr, count } = await supabase
      .from('linked_wallets')
      .delete({ count: 'exact' })
      .eq('user_id', currentUserId)
      .eq('wallet_pubkey', wallet_to_unlink)

    if (deleteErr || count === 0) {
      return NextResponse.json({ error: 'Failed to unlink wallet. It may not exist or not belong to you.' }, { status: 400 })
    }

    // Insert audit log
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const ua = req.headers.get('user-agent') || 'unknown'
    await supabase.from('wallet_audit_log').insert({
      user_id: currentUserId,
      action: 'unlink',
      wallet_pubkey: wallet_to_unlink,
      ip_address: ip,
      user_agent: ua
    })

    return NextResponse.json({ success: true, wallet: wallet_to_unlink }, { status: 200 })
  } catch (error) {
    console.error('Wallet unlinking error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
