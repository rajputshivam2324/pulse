'use client'

/**
 * Dashboard Home — Authenticated hub showing all registered programs.
 *
 * Enterprise pattern (Claude, Linear, Vercel):
 * - This is the first page users see after authentication
 * - Lists all registered programs with status indicators
 * - "Add New Program" action always accessible
 * - Never forces re-entry of previously registered program IDs
 * - Single source of truth for program navigation
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePulseStore } from '@/store'
import { PLAN_LIMITS, type PlanType } from '@/lib/plans'
import { buildUpgradeUrl } from '@/lib/upgrade'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

interface Program {
  id: string
  name: string | null
  program_address: string
  network: string
  last_synced_at: string | null
  created_at?: string
}

export default function DashboardHomePage() {
  const router = useRouter()
  const { user, setActiveProgram } = usePulseStore()
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const currentPlan = PLAN_LIMITS[(user.plan as PlanType) || 'free'] || PLAN_LIMITS.free
  const atProgramLimit = currentPlan.max_programs !== -1 && programs.length >= currentPlan.max_programs
  const addProgramHref = atProgramLimit ? buildUpgradeUrl('/dashboard/new') : '/dashboard/new'

  const fetchPrograms = useCallback(async () => {
    if (!user.token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/programs`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setPrograms(data.programs || [])
      } else if (res.status === 401) {
        // Token invalid — AuthGuard will handle redirect
      } else {
        setError('Failed to load programs')
      }
    } catch {
      setError('Network error — could not reach server')
    } finally {
      setLoading(false)
    }
  }, [user.token])

  useEffect(() => {
    void fetchPrograms()
  }, [fetchPrograms])

  function handleOpenProgram(program: Program) {
    setActiveProgram({
      id: program.program_address,
      programAddress: program.program_address,
      name: program.name,
      network: program.network || 'mainnet',
      lastSyncedAt: program.last_synced_at,
    })
    router.push(`/dashboard/${program.program_address}`)
  }

  const truncate = (s: string, n = 8) =>
    s.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-4)}` : s

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="min-h-screen relative overflow-hidden">

      {/* Top Rail */}
      <header className="fixed top-0 left-0 right-0 z-50 machined-panel px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3 no-underline group">
            <div className="w-8 h-8 rounded-sm bg-gradient-to-b from-[#444] to-[#111] flex items-center justify-center border border-[#000] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
              <span className="text-[#fff] text-xs font-mono font-bold">P-8</span>
            </div>
            <span className="f1-h text-xl font-bold uppercase tracking-widest text-black">Pulse</span>
          </Link>
          <div className="w-px h-6 bg-black/20 shadow-[1px_0_0_rgba(255,255,255,0.3)]" />
          <h1 className="text-sm f1-h font-bold text-black/80 uppercase tracking-widest">Programs</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href={addProgramHref} className="btn-hero text-[10px] uppercase tracking-widest">
            <span className="btn-label flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {atProgramLimit ? 'Upgrade to Add' : 'Add Program'}
            </span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-20">

        {/* Page Header */}
        <div className="page-header text-left flex flex-col items-start mb-8 border-none">
          <div className="page-title">Your Programs</div>
          <div className="page-sub">Select a program to view analytics, or add a new one</div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex items-center gap-3 text-black/40">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
              </svg>
              <span className="text-[10px] f1-m uppercase tracking-widest">Loading programs…</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="plate p-4 flex items-center justify-between border-l-4 border-red-500 mb-6">
            <span className="text-red-700 f1-m text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
              <span className="status-dot error" /> {error}
            </span>
            <button onClick={fetchPrograms} className="btn text-[10px] uppercase tracking-widest">
              <span className="btn-label">Retry</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && programs.length === 0 && (
          <div className="plate p-12 text-center relative overflow-hidden">
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-black/5 border border-black/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
                <svg className="w-7 h-7 stroke-black/40" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <h2 className="text-xl f1-h font-bold uppercase text-black/80 mb-3">
                No Programs Registered
              </h2>
              <p className="text-xs f1-m text-black/50 uppercase tracking-widest mb-8 max-w-md mx-auto">
                Add your first Solana program to start tracking on-chain analytics and AI insights.
              </p>
              <Link href={addProgramHref} className="btn-hero text-xs uppercase tracking-widest inline-flex">
                <span className="btn-label flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {atProgramLimit ? 'Upgrade to Add' : 'Add Your First Program'}
                </span>
              </Link>
            </div>
          </div>
        )}

        {/* Programs Grid */}
        {!loading && programs.length > 0 && (
          <div className="space-y-4">
            {programs.map((program) => (
              <button
                key={program.id}
                onClick={() => handleOpenProgram(program)}
                className="plate p-6 w-full text-left flex items-center justify-between gap-6 group hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center gap-5 min-w-0">
                  {/* Program Icon */}
                  <div className="w-12 h-12 rounded-sm bg-gradient-to-b from-[#444] to-[#111] flex items-center justify-center border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] shrink-0">
                    <span className="text-white f1-h font-black text-lg">
                      {(program.name || program.program_address)[0].toUpperCase()}
                    </span>
                  </div>

                  {/* Program Info */}
                  <div className="min-w-0">
                    <h3 className="text-base f1-h font-bold text-black/80 uppercase truncate">
                      {program.name || 'Unnamed Program'}
                    </h3>
                    <p className="text-[10px] f1-m font-mono text-black/40 mt-1 truncate">
                      {truncate(program.program_address, 12)}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="tag">{program.network || 'mainnet'}</span>
                      {program.last_synced_at && (
                        <span className="text-[9px] f1-m text-black/30 flex items-center gap-1">
                          <span className="status-dot on" />
                          Synced {timeAgo(program.last_synced_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="shrink-0 text-black/20 group-hover:text-black/60 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}

            {/* Add Another */}
            <Link
              href={addProgramHref}
              className="plate p-5 flex items-center justify-center gap-3 text-black/40 hover:text-black/70 transition-colors group no-underline"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[10px] f1-m font-bold uppercase tracking-widest">
                {atProgramLimit ? 'Upgrade to Add' : 'Add Another Program'}
              </span>
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
