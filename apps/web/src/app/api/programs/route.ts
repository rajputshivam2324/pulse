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
  console.log('Auth header present:', !!authHeader)
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('Missing or invalid auth header')
    return null
  }
  const token = authHeader.slice(7)
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    console.log('JWT verified, payload:', payload)
    // Fix #11: `sub` is set by verify/route.ts, fallback to `wallet` custom claim
    const wallet = (payload.sub as string) || (payload.wallet as string)
    if (!wallet) return null
    return { wallet, plan: (payload.plan as string) || 'free' }
  } catch (err) {
    console.error('JWT verification failed:', err)
    return null
  }
}

/**
 * GET /api/programs?wallet=<wallet_pubkey>
 * List all programs registered by a user.
 * Fix #10: Requires JWT authentication — wallet must match JWT.
 */
export async function GET(req: NextRequest) {
  // Fix #10: Require authentication
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized - valid JWT required' }, { status: 401 })
  }

  const wallet = req.nextUrl.searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
  }

  // Ensure the requesting user can only list their own programs
  if (wallet !== auth.wallet) {
    return NextResponse.json({ error: 'Forbidden - wallet mismatch' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    // Find user by wallet
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('wallet_pubkey', wallet)
      .single()

    if (!user) {
      return NextResponse.json({ programs: [] })
    }

    // Get programs for user
    const { data: programs, error } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', user.id)
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
    // Verify JWT and get authenticated wallet
    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized - valid JWT required' }, { status: 401 })
    }

    const { wallet, programAddress, name, network } = await req.json()

    if (!wallet || !programAddress) {
      return NextResponse.json(
        { error: 'wallet and programAddress are required' },
        { status: 400 }
      )
    }

    // Wallet ownership check: JWT wallet must match request body wallet
    if (wallet !== auth.wallet) {
      return NextResponse.json(
        { error: 'Wallet mismatch - JWT wallet does not match request body wallet' },
        { status: 403 }
      )
    }

    const supabase = getSupabase()

    // Upsert user (create if not exists)
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert(
        { wallet_pubkey: wallet },
        { onConflict: 'wallet_pubkey' }
      )
      .select('id')
      .single()

    if (userError || !user) {
      console.error('Failed to upsert user:', userError)
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    // Insert program (or return existing)
    const { data: program, error: progError } = await supabase
      .from('programs')
      .upsert(
        {
          user_id: user.id,
          program_address: programAddress,
          name: name || null,
          network: network || 'devnet',
        },
        { onConflict: 'user_id,program_address' }
      )
      .select('*')
      .single()

    if (progError) {
      console.error('Failed to register program:', progError)
      return NextResponse.json({ error: 'Failed to register program' }, { status: 500 })
    }

    return NextResponse.json({ program })
  } catch (error) {
    console.error('Programs API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
