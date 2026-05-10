'use client'

/**
 * AuthGuard — Global authentication gatekeeper.
 *
 * Wraps all protected routes. Handles:
 * 1. Redirect to /connect if no JWT and no wallet
 * 2. Auto-re-auth when wallet connected but JWT expired (ONE sign, silent)
 * 3. Session cleanup on wallet disconnect (with grace period for page transitions)
 * 4. Session invalidation on wallet switch (different pubkey)
 * 5. Live plan sync from /user/me
 *
 * CRITICAL: This is the SINGLE source of truth for "is the user authenticated?"
 * Individual pages must NEVER check user.token themselves.
 *
 * Grace period architecture:
 * - Wallet adapters briefly report disconnected=true during page transitions
 * - We wait 2s before clearing session on disconnect to avoid false logouts
 * - Immediate clear only happens on explicit wallet switch (different pubkey)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { usePulseStore } from '@/store'
import { signInWithSolana } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

// JWT expiry check (decode without verification — just for client-side UX)
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp ? payload.exp * 1000 < Date.now() : false
  } catch {
    return true
  }
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { publicKey, connected, signMessage } = useWallet()
  const { user, setUser, clearUser, _hydrated, linkedWallets, setLinkedWallets } = usePulseStore()
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'needs_connect' | 'signing'>('checking')

  // Refs to prevent double-fire and race conditions
  const syncedRef = useRef(false)
  const signingRef = useRef(false)
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync plan from /user/me (once per mount)
  const syncProfile = useCallback(async (token: string) => {
    if (syncedRef.current) return
    syncedRef.current = true
    try {
      const res = await fetch(`${API_BASE}/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.plan && data.plan !== user.plan) {
          setUser({ plan: data.plan })
        }
        // Store linked wallets so wallet-switch detection can skip session clear
        if (data.linked_wallets) {
          setLinkedWallets(data.linked_wallets)
        }
      } else if (res.status === 401) {
        // Token rejected by backend — force re-auth
        clearUser()
        setAuthState('needs_connect')
      }
    } catch {
      // Network error — don't block, continue with cached plan
    }
  }, [user.plan, setUser, clearUser, setLinkedWallets])

  // Auto-sign-in: ONE sign only, with ref guard against double-fire
  const attemptAutoSignIn = useCallback(async () => {
    if (signingRef.current || !publicKey || !signMessage) return false
    signingRef.current = true
    setAuthState('signing')
    try {
      const token = await signInWithSolana(publicKey.toBase58(), signMessage)
      let plan = 'free'
      try {
        const meRes = await fetch(`${API_BASE}/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          plan = me.plan || 'free'
        }
      } catch { /* non-fatal */ }

      setUser({ wallet: publicKey.toBase58(), token, plan })
      syncedRef.current = true
      setAuthState('authenticated')
      return true
    } catch {
      setAuthState('needs_connect')
      return false
    } finally {
      signingRef.current = false
    }
  }, [publicKey, signMessage, setUser])

  // Main auth decision logic
  useEffect(() => {
    if (!_hydrated) return

    // Clear any pending disconnect timer when this effect re-runs
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }

    const hasToken = !!user.token
    const tokenExpired = hasToken && isTokenExpired(user.token!)
    const tokenValid = hasToken && !tokenExpired
    const walletConnected = connected && !!publicKey
    const isLinkingWallet = usePulseStore.getState().isLinkingWallet

    // Case 1: Valid token exists
    if (tokenValid) {
      // Wallet switch detection: wallet connected but pubkey doesn't match stored wallet
      if (walletConnected && user.wallet && user.wallet !== publicKey.toBase58()) {
        const connectedKey = publicKey.toBase58()
        const isLinkedWallet = linkedWallets.includes(connectedKey)
        if (!isLinkingWallet && !isLinkedWallet) {
          // Different wallet, NOT linking, NOT a known linked wallet → clear old session, re-auth
          clearUser()
          syncedRef.current = false
          if (signMessage) {
            void attemptAutoSignIn()
          } else {
            setAuthState('needs_connect')
          }
          return
        }
        // If linking wallet or connected wallet is a linked wallet, keep session
      }

      // Token valid, wallet matches (or no wallet connected but token still good)
      // This is the key fix: don't require wallet connection if token is valid.
      // JWT is the auth source of truth, not wallet connection state.
      setAuthState('authenticated')
      void syncProfile(user.token!)
      return
    }

    // Case 2: Token expired/missing but wallet connected → auto-re-auth (ONE sign)
    if (walletConnected && signMessage && (!hasToken || tokenExpired)) {
      if (!signingRef.current) {
        void attemptAutoSignIn()
      }
      return
    }

    // Case 3: No wallet, no valid token → needs connect
    // But wait briefly — wallet adapter may still be initializing after page nav
    if (!walletConnected && !tokenValid) {
      // If we have an expired token, give wallet adapter time to reconnect
      if (hasToken && tokenExpired) {
        disconnectTimerRef.current = setTimeout(() => {
          setAuthState('needs_connect')
        }, 2000)
        return
      }
      setAuthState('needs_connect')
    }
  }, [_hydrated, user.token, user.wallet, connected, publicKey, signMessage, syncProfile, attemptAutoSignIn, clearUser])

  // Watch for wallet disconnect — with grace period
  useEffect(() => {
    if (!_hydrated) return

    const isLinkingWallet = usePulseStore.getState().isLinkingWallet

    if (!connected && user.token && !isLinkingWallet) {
      // Don't clear immediately — wallet adapter briefly disconnects during page transitions
      // Wait 2s. If wallet reconnects within that window, the timer gets cleared
      // by the main auth effect above.
      disconnectTimerRef.current = setTimeout(() => {
        clearUser()
        setAuthState('needs_connect')
        syncedRef.current = false
      }, 2000)

      return () => {
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current)
          disconnectTimerRef.current = null
        }
      }
    }
  }, [connected, _hydrated, user.token, clearUser])

  // Redirect to /connect when needs_connect
  useEffect(() => {
    if (authState === 'needs_connect') {
      router.replace('/connect')
    }
  }, [authState, router])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current)
      }
    }
  }, [])

  // Loading / signing states
  if (!_hydrated || authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-black/40">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
          </svg>
          <span className="text-[10px] f1-m uppercase tracking-widest">Verifying session…</span>
        </div>
      </div>
    )
  }

  if (authState === 'signing') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="plate p-8 max-w-sm text-center animate-fade-in">
          <div className="w-16 h-16 rounded-sm bg-gradient-to-b from-[#444] to-[#111] flex items-center justify-center mx-auto mb-4 border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <span className="text-white f1-h font-black text-2xl">P</span>
          </div>
          <h2 className="text-lg f1-h font-bold uppercase text-black/80 mb-2">Session Renewal</h2>
          <p className="text-[10px] f1-m uppercase tracking-widest text-black/50 mb-4">
            Sign the message in your wallet to continue
          </p>
          <svg className="animate-spin h-5 w-5 mx-auto text-black/30" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
          </svg>
        </div>
      </div>
    )
  }

  if (authState === 'needs_connect') {
    return null // Redirect happening via useEffect
  }

  return <>{children}</>
}
