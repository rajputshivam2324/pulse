import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Programs API — Register and list Solana programs for a user.
 * Uses Supabase with service role key for backend operations.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

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
 */
export async function POST(req: NextRequest) {
  try {
    const { wallet, programAddress, name, network } = await req.json()

    if (!wallet || !programAddress) {
      return NextResponse.json(
        { error: 'wallet and programAddress are required' },
        { status: 400 }
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
