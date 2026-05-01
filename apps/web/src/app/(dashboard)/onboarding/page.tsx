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
    const programAddress = address.trim()
    if (!programAddress) return

    setStatus('syncing')
    setSyncing(true)
    setError(null)
    setSyncInfo('Interfacing with Helius RPC node...')

    try {
      const token = localStorage.getItem('pulse_token')
      const walletStr = localStorage.getItem('pulse_wallet')

      if (!token || !walletStr) {
        throw new Error('Wallet auth missing. Re-initialize.')
      }

      // Step 1: Register program first
      const registerRes = await fetch('/api/programs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          wallet: localStorage.getItem('pulse_wallet'), // Ensure wallet is correct
          programAddress,
          name: programName || undefined,
          network: 'mainnet'
        }),
      })

      if (!registerRes.ok) {
        const errData = await registerRes.json().catch(() => null)
        throw new Error(errData?.error || `Registration sequence failed (${registerRes.status})`)
      }

      // Step 2: Sync program
      const res = await fetch(
        `${API_BASE}/analytics/sync/${programAddress}?program_name=${encodeURIComponent(programName || programAddress)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Sync sequence failed (${res.status})`)
      }

      const data = await res.json()

      if (data.status === 'no_data') {
        setStatus('error')
        setError('No transactions compiled. Verify program ID.')
        return
      }

      const transactionsParsed = data.transactionsParsed ?? data.transactions_parsed
      setSyncInfo(`Indexed ${transactionsParsed?.toLocaleString() || 'many'} blocks`)
      setMetrics(programAddress, data.metrics)
      setActiveProgram({
        id: programAddress,
        programAddress,
        name: programName || null,
        network: 'mainnet',
        lastSyncedAt: new Date().toISOString(),
      })

      setStatus('done')
      setTimeout(() => {
        router.push(`/dashboard/${programAddress}`)
      }, 1200)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'System Failure')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 machined-panel px-8 py-3 flex items-center justify-between">
        <Link href="/" className="logo flex items-center gap-3 no-underline group">
          <div className="w-8 h-8 rounded-sm bg-gradient-to-b from-[#444] to-[#111] flex items-center justify-center border border-[#000] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
            <span className="text-[#fff] text-xs font-mono font-bold">P-8</span>
          </div>
          <span className="f1-h text-xl font-bold uppercase tracking-widest text-black">Pulse</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-ghost"><span className="btn-label">Abort</span></Link>
        </div>
      </nav>

      {/* Onboarding Form */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-6 py-24">
        <div className="max-w-lg w-full animate-slide-up">
          
          {/* Header */}
          <div className="page-header flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#111] rounded-full flex items-center justify-center mx-auto mb-6 border border-black/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.3)]">
              <span className="text-white f1-h font-black text-2xl">P</span>
            </div>
            <div className="page-title text-black/80 text-3xl font-bold mb-2">Initialize Target</div>
            <div className="page-sub">Input Solana program ID. Initiating block history indexing...</div>
          </div>

          {/* Form Card */}
          <div className="plate p-8 space-y-6">
            
            <div className="badge-row -mx-8 -mt-8 mb-8 px-8">
              <div className="badge">
                <div className="badge-num">01</div>
                <div className="badge-label">Configuration</div>
              </div>
            </div>

            <div className="relative z-10">
              <label
                htmlFor="program-name"
                className="block text-[10px] f1-m font-bold uppercase tracking-widest mb-2 text-black/60"
              >
                Alias <span className="text-black/40">(Optional)</span>
              </label>
              <input
                id="program-name"
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="e.g. My DEX, NFT Marketplace"
                className="inp"
              />
            </div>

            <div className="relative z-10 mt-6">
              <label
                htmlFor="program-address"
                className="block text-[10px] f1-m font-bold uppercase tracking-widest mb-2 text-black/60"
              >
                Program ID <span className="text-red-600">*</span>
              </label>
              <input
                id="program-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
                className="inp text-sm"
              />
            </div>

            <div className="divider"></div>

            <button
              onClick={handleSync}
              disabled={!address.trim() || status === 'syncing'}
              className="btn-hero w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative z-10"
            >
              {status === 'syncing' ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                  </svg>
                  <span className="btn-label">Indexing...</span>
                </>
              ) : status === 'done' ? (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="btn-label">Compiled!</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="btn-label">Execute Scan</span>
                </>
              )}
            </button>

            {/* Status Messages */}
            <div className="text-center min-h-[24px] relative z-10 mt-4">
              {status === 'syncing' && syncInfo && (
                <p className="text-[10px] f1-m uppercase tracking-widest text-black flex items-center justify-center gap-2">
                  <span className="status-dot on"></span> {syncInfo}
                </p>
              )}
              {status === 'error' && error && (
                <p className="text-[10px] f1-m uppercase tracking-widest text-red-600 font-bold flex items-center justify-center gap-2">
                  <span className="status-dot error"></span> {error}
                </p>
              )}
            </div>
          </div>

          {/* Help Text */}
          <div className="footer mt-6">
            Helius network interface active. 1M credits/mo available.
          </div>
        </div>
      </div>
    </div>
  )
}