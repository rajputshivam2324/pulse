import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

/**
 * Programs API — Register and list Solana programs for a user.
 * Uses Supabase with service role key for backend operations.
 *
 * Fix #5: Require JWT_SECRET env var.
 * Fix #10: Add JWT authentication to GET endpoint.
 * Fix #11: Read `sub` claim (set by verify route) instead of non-existent custom claim.
 * Fix #18: Lazy-initialize Supabase client to handle missing env vars gracefully.
 */

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(secret)
}

// Fix #18: Lazy-initialize Supabase client
let _supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }
    _supabase = createClient(url, key)
  }
  return _supabase
}

/**
 * Extract and verify JWT from Authorization header.
 * Fix #11: Read `sub` claim for wallet address.
 */
async function verifyAuth(request: NextRequest): Promise<{ wallet: string; plan: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7)
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    const wallet = (payload.sub as string) || (payload.wallet as string)
    if (!wallet) return null
    return { wallet, plan: (payload.plan as string) || 'free' }
  } catch (err) {
    return null
  }
}

/**
 * Resolve a wallet pubkey to its primary user ID, checking linked_wallets first.
 */
async function resolveWalletToUserId(supabase: ReturnType<typeof createClient>, wallet: string): Promise<string | null> {
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
}

/**
 * GET /api/programs?wallet=<wallet_pubkey>
 * List all programs registered by a user.
 * Fix #10: Requires JWT authentication — wallet must match JWT.
 */
export async function GET(req: NextRequest) {
  // Require authentication
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized - valid JWT required' }, { status: 401 })
  }

  try {
    const supabase = getSupabase()

    // Always resolve by the JWT wallet — not the query param.
    // This is the fix: user.wallet in the store may diverge from JWT sub in
    // edge cases (e.g. wallet reconnect race), so use the authoritative JWT.
    const userId = await resolveWalletToUserId(supabase, auth.wallet)

    if (!userId) {
      return NextResponse.json({ programs: [] })
    }

    const { data: programs, error } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch programs:', error)
      return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
    }

    return NextResponse.json({ programs: programs || [] })
  } catch (error) {
    console.error('Programs API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/programs
 * Register a new Solana program for tracking.
 * Body: { wallet, programAddress, name?, network? }
 * Requires Authorization: Bearer {JWT} header. Wallet must match JWT's sub claim.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify JWT — the JWT wallet is the authoritative identity
    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized - valid JWT required' }, { status: 401 })
    }

    const { programAddress, name, network } = await req.json()

    if (!programAddress) {
      return NextResponse.json(
        { error: 'programAddress is required' },
        { status: 400 }
      )
    }

    // Use the JWT wallet as the authoritative identity — not the request body.
    // This prevents 403 when user.wallet in the Zustand store desyncs from JWT sub
    // (e.g. wallet reconnect race condition, linked wallet session).
    const wallet = auth.wallet

    const supabase = getSupabase()

    // Resolve to primary user_id (handles linked wallets transparently)
    let userId = await resolveWalletToUserId(supabase, wallet)

    if (!userId) {
      // User row missing (edge case — verify route normally creates it).
      // Create it here as a safety fallback.
      const { data: userData, error: userError } = await supabase
        .from('users')
        .upsert(
          { wallet_pubkey: wallet, plan: 'free' } as any,
          { onConflict: 'wallet_pubkey' }
        )
        .select('id')
        .maybeSingle()

      if (userError || !userData) {
        console.error('Failed to upsert user:', userError)
        return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
      }
      userId = (userData as unknown as { id: string }).id
    }

    // Upsert program row (idempotent — safe to call multiple times)
    const { data: program, error: progError } = await supabase
      .from('programs')
      .upsert(
        {
          user_id: userId,
          program_address: programAddress,
          name: name || null,
          network: network || 'mainnet',
        } as any,
        { onConflict: 'user_id,program_address' }
      )
      .select('*')
      .maybeSingle()

    if (progError || !program) {
      console.error('Failed to register program:', progError)
      return NextResponse.json({ error: 'Failed to register program' }, { status: 500 })
    }

    return NextResponse.json({ program })
  } catch (error) {
    console.error('Programs API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
