'use client'

/**
 * Onboarding Page
 * Founder pastes their Solana program address, Pulse syncs data.
 */

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

      setSyncInfo(`Synced ${data.transactions_parsed} transactions`)
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
      }, 1000)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <div className="max-w-lg w-full animate-slide-up">
        {/* Header */}
        <div className="text-center mb-10">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
          >
            <span className="text-white font-bold text-xl">P</span>
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Add your program
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Paste your Solana program address. We&apos;ll fetch your full transaction history and compute analytics.
          </p>
        </div>

        {/* Form */}
        <div className="card p-6 space-y-5">
          <div>
            <label
              htmlFor="program-name"
              className="block text-xs font-medium mb-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Program Name (optional)
            </label>
            <input
              id="program-name"
              type="text"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. My DEX, NFT Marketplace"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all"
              style={{
                background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="program-address"
              className="block text-xs font-medium mb-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Program Address *
            </label>
            <input
              id="program-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
              className="w-full px-4 py-3 rounded-lg text-sm font-mono outline-none transition-all"
              style={{
                background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <button
            onClick={handleSync}
            disabled={!address.trim() || status === 'syncing'}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'syncing' ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    className="opacity-75"
                  />
                </svg>
                Syncing...
              </>
            ) : status === 'done' ? (
              '✅ Synced! Redirecting...'
            ) : (
              'Sync & Analyze'
            )}
          </button>

          {syncInfo && status === 'syncing' && (
            <p className="text-xs text-center" style={{ color: 'var(--color-brand-light)' }}>
              {syncInfo}
            </p>
          )}

          {error && (
            <p className="text-xs text-center" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}
        </div>

        <p
          className="text-xs text-center mt-6"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Helius free tier supports 1M credits/month — more than enough for development.
        </p>
      </div>
    </div>
  )
}
