'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePulseStore } from '@/store'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

export default function OnboardingPage() {
  const router = useRouter()
  const { setSyncing, setMetrics, setActiveProgram } = usePulseStore()
  const [address, setAddress] = useState('')
  const [programName, setProgramName] = useState('')
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [syncInfo, setSyncInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    if (!address.trim()) return

    setStatus('syncing')
    setSyncing(true)
    setError(null)
    setSyncInfo('Fetching transaction history from Helius...')

    try {
      const res = await fetch(
        `${API_BASE}/analytics/sync/${address.trim()}?program_name=${encodeURIComponent(programName || address.trim())}`,
        { method: 'POST' }
      )

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Sync failed (${res.status})`)
      }

      const data = await res.json()

      if (data.status === 'no_data') {
        setStatus('error')
        setError('No transactions found for this address. Check the program address and try again.')
        return
      }

      setSyncInfo(`Synced ${data.transactions_parsed?.toLocaleString() || 'many'} transactions`)
      setMetrics(data.metrics)
      setActiveProgram({
        id: address.trim(),
        programAddress: address.trim(),
        name: programName || null,
        network: 'mainnet',
        lastSyncedAt: new Date().toISOString(),
      })

      setStatus('done')
      setTimeout(() => {
        router.push(`/dashboard/${address.trim()}`)
      }, 1200)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen relative">
      {/* Grid Background */}
      <div className="grid-bg"></div>
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass px-12 py-5 flex items-center justify-between">
        <Link href="/" className="logo flex items-center gap-2.5 no-underline">
          <div className="logo-mark w-8 h-8 bg-[#2C2420] rounded-full flex items-center justify-center text-[#FAF7F2] text-sm font-medium">P</div>
          <span style={{ fontFamily: 'Georgia, serif', letterSpacing: '-0.3px' }} className="font-serif text-xl font-bold text-[#2C2420]">Pulse</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-ghost">Back</Link>
        </div>
      </nav>

      {/* Onboarding Form */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-6 py-24">
        <div className="max-w-lg w-full animate-slide-up">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-[#2C2420] rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-[#FAF7F2] font-serif font-bold text-2xl" style={{ fontFamily: 'Georgia, serif' }}>P</span>
            </div>
            <h1 className="text-3xl font-serif font-bold mb-3" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
              Add your program
            </h1>
            <p className="text-sm" style={{ color: '#7A6860' }}>
              Paste your Solana program address. We&apos;ll fetch your full transaction history and compute analytics.
            </p>
          </div>

          {/* Form Card */}
          <div className="card p-6 space-y-5" style={{ background: '#F5EFE6' }}>
            <div>
              <label
                htmlFor="program-name"
                className="block text-xs font-medium mb-2"
                style={{ color: '#7A6860' }}
              >
                Program Name <span style={{ color: '#A8978E' }}>(optional)</span>
              </label>
              <input
                id="program-name"
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="e.g. My DEX, NFT Marketplace"
                className="input"
              />
            </div>

            <div>
              <label
                htmlFor="program-address"
                className="block text-xs font-medium mb-2"
                style={{ color: '#7A6860' }}
              >
                Program Address <span style={{ color: '#D4825A' }}>*</span>
              </label>
              <input
                id="program-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
                className="input font-mono text-sm"
              />
            </div>

            <button
              onClick={handleSync}
              disabled={!address.trim() || status === 'syncing'}
              className="btn-hero w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 py-3.5"
            >
              {status === 'syncing' ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                  </svg>
                  Syncing...
                </>
              ) : status === 'done' ? (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Ready! Redirecting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync & Analyze
                </>
              )}
            </button>

            {/* Status Messages */}
            <div className="text-center min-h-[24px]">
              {status === 'syncing' && syncInfo && (
                <p className="text-xs" style={{ color: '#B5623E' }}>
                  {syncInfo}
                </p>
              )}
              {status === 'error' && error && (
                <p className="text-xs" style={{ color: '#B5623E' }}>
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Help Text */}
          <p className="text-xs text-center mt-6" style={{ color: '#A8978E' }}>
            Helius free tier supports 1M credits/month — more than enough for development.
          </p>
        </div>
      </div>
    </div>
  )
}