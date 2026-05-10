'use client'

import dynamic from 'next/dynamic'
import { useWallet } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { signInWithSolana } from '@/lib/auth'
import { usePulseStore } from '@/store'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
)

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

export default function ConnectPage() {
  const { publicKey, signMessage, connected } = useWallet()
  const router = useRouter()
  const setUser = usePulseStore((s) => s.setUser)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'wallet' | 'signing' | 'syncing'>('wallet')

  const handleSignIn = useCallback(async () => {
    if (!publicKey || !signMessage) return
    setIsSigningIn(true)
    setError(null)
    setStep('signing')

    try {
      // Step 1: SIWS — get JWT
      const token = await signInWithSolana(publicKey.toBase58(), signMessage)

      // Step 2: Fetch live plan from DB (never trust client-side default)
      setStep('syncing')
      let plan = 'free'
      try {
        const meRes = await fetch(`${API_BASE}/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          plan = me.plan || 'free'
        }
      } catch {
        // Non-fatal — fall back to free plan
      }

      setUser({ wallet: publicKey.toBase58(), token, plan })
      router.push('/dashboard')
    } catch (err) {
      setError('Sign-in failed. Please try again.')
      console.error('SIWS error:', err)
      setStep('wallet')
    } finally {
      setIsSigningIn(false)
    }
  }, [publicKey, router, setUser, signMessage])

  useEffect(() => {
    if (connected && publicKey && signMessage && !isSigningIn && !error) {
      const timeout = window.setTimeout(() => {
        void handleSignIn()
      }, 0)
      return () => window.clearTimeout(timeout)
    }
  }, [connected, handleSignIn, isSigningIn, publicKey, signMessage, error])

  const stepLabels: Record<string, string> = {
    signing: 'Sign the message in your wallet…',
    syncing: 'Syncing your account…',
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      {/* Subtle background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg,#000 0,#000 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#000 0,#000 1px,transparent 1px,transparent 40px)',
        }}
      />

      <div className="relative z-10 max-w-md w-full animate-slide-up">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-sm bg-gradient-to-b from-[#444] to-[#111] flex items-center justify-center mx-auto mb-6 border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.3)]">
            <span className="text-white f1-h font-black text-2xl">P</span>
          </div>
          <h1 className="text-3xl f1-h font-bold uppercase tracking-tight text-black/80 mb-3">
            Sign in to Pulse
          </h1>
          <p className="text-xs f1-m uppercase tracking-widest text-black/50">
            No email. No password. No gas fee.
          </p>
        </div>

        {/* Auth Card */}
        <div className="plate p-8">
          <div className="badge-row -mx-8 -mt-8 mb-8 px-8">
            <div className="badge">
              <div className="badge-num">01</div>
              <div className="badge-label">Wallet Authentication</div>
            </div>
          </div>

          <div className="relative z-10 space-y-6">
            {/* Wallet Button */}
            <div className="flex justify-center">
              <WalletMultiButton />
            </div>

            {/* Status */}
            {isSigningIn && (
              <div className="flex items-center justify-center gap-3 py-2">
                <svg className="animate-spin h-4 w-4 text-black/40" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
                <p className="text-[10px] f1-m uppercase tracking-widest text-black/60">
                  {stepLabels[step] || 'Authenticating…'}
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 border-l-4 border-red-500 bg-red-50">
                <p className="text-[10px] f1-m uppercase tracking-widest text-red-700 font-bold">
                  {error}
                </p>
                <button
                  onClick={() => setError(null)}
                  className="text-[10px] f1-m text-red-500 mt-1 uppercase tracking-widest"
                >
                  Try again
                </button>
              </div>
            )}

            <div className="divider" />

            {/* How it works */}
            <div className="space-y-3">
              {[
                ['01', 'Connect wallet', 'Phantom, Solflare, or any Solana wallet'],
                ['02', 'Sign a message', 'One-click — no transaction, no gas'],
                ['03', 'Access dashboard', 'Your programs, metrics, and AI insights'],
              ].map(([num, title, desc]) => (
                <div key={num} className="flex items-start gap-3">
                  <span className="text-[9px] f1-m font-bold text-black/30 mt-0.5 tabular-nums w-5 shrink-0">{num}</span>
                  <div>
                    <p className="text-[10px] f1-m font-bold uppercase tracking-widest text-black/60">{title}</p>
                    <p className="text-[9px] f1-m text-black/40 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-[9px] f1-m text-black/30 uppercase tracking-widest mt-6">
          Pulse · Solana Analytics · v0.1
        </p>
      </div>
    </div>
  )
}
