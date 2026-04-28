/**
 * Supabase client for Pulse frontend.
 * Uses the service role key for server-side operations
 * and anon key for client-side.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Client-side Supabase instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase instance (with service role for bypassing RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
