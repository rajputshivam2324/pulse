import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify, decodeJwt } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.NEXT_PUBLIC_JWT_SECRET || ''
)

/**
 * Programs API — Register and list Solana programs for a user.
 * Uses Supabase with service role key for backend operations.
 * Requires JWT authentication for all write operations (POST).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

/**
 * Extract and verify JWT from Authorization header.
 * Returns the decoded JWT payload if valid.
 */
async function verifyAuth(request: NextRequest): Promise<{ wallet: string; plan: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7)
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return { wallet: payload.sub as string, plan: (payload.plan as string) || 'free' }
  } catch {
    return null
  }
}

/**
 * GET /api/programs?wallet=<wallet_pubkey>
 * List all programs registered by a user.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
  }

  try {
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
