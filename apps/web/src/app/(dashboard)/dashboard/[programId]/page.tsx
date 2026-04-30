'use client'

/**
 * Main Analytics Dashboard
 * Premium Warm Design — Cream / Rose / Charcoal
 */

import { useCallback, useEffect, useState, type ComponentProps } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePulseStore } from '@/store'
import { MetricCard, DAWChart, FunnelChart, RetentionGrid } from '@/components/dashboard/Charts'
import { canAccess } from '@/lib/plans'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

type MetricSummary = Record<string, number | string | undefined>
type ChartDatum = Record<string, number | string | null | undefined>
type DawDatum = { date: string; daw: number; new_wallets: number; returning_wallets: number }
type FunnelDatum = { step: number; label: string; wallet_count: number; drop_off_rate: number }
type RetentionDatum = { cohort_week: string; week_number: number; wallet_count: number; retention_rate: number }
type DashboardMetrics = {
  summary?: MetricSummary
  dawTrend?: ChartDatum[]
  daw_trend?: ChartDatum[]
  funnel?: ChartDatum[]
  retentionCohorts?: ChartDatum[]
  retention_cohorts?: ChartDatum[]
}

function AnimatedNumber({ value, suffix = '' }: { value: string | number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0)
  const numValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''))

  useEffect(() => {
    if (isNaN(numValue)) return
    const duration = 1000
    const steps = 30
    const increment = numValue / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= numValue) {
        setDisplayValue(numValue)
        clearInterval(timer)
      } else {
        setDisplayValue(current)
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [numValue])

  if (isNaN(numValue)) return <span>{value}{suffix}</span>
  
  return (
    <span>
      {displayValue >= 1000 ? displayValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : displayValue.toFixed(0)}
      {suffix}
    </span>
  )
}

export default function DashboardPage() {
  const params = useParams()
  const router = useRouter()
  const programId = params.programId as string

  const {
    metricsByProgram,
    setMetrics,
    isSyncing,
    setSyncing,
    user,
    activeProgram,
  } = usePulseStore()

  const metrics = programId ? metricsByProgram[programId] : null

  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    if (!user.token || !programId) return
    try {
      const res = await fetch(`${API_BASE}/analytics/metrics/${programId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMetrics(programId, data)
      } else if (res.status === 404) {
        setMetrics(programId, null)
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err)
      setError('Failed to load metrics. Please try again.')
    }
  }, [programId, setMetrics, user.token])

  useEffect(() => {
    if (!metrics && !isSyncing && programId) {
      const timeout = window.setTimeout(() => {
        void fetchMetrics()
      }, 0)
      return () => window.clearTimeout(timeout)
    }
  }, [fetchMetrics, isSyncing, metrics, programId])

  async function handleSync() {
    if (!user.token || !programId) return
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/analytics/sync/${programId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMetrics(programId, data.metrics)
        setLastSynced(new Date().toLocaleTimeString())
      } else {
        const errData = await res.json()
        setError(errData.detail || 'Sync failed')
      }
    } catch (err) {
      console.error('Sync failed:', err)
      setError('Sync failed. Please try again.')
    } finally {
      setSyncing(false)
    }
  }


  const dashboardMetrics = metrics as DashboardMetrics | null
  const summary = dashboardMetrics?.summary || {}
  const rawDawTrend = dashboardMetrics?.dawTrend || dashboardMetrics?.daw_trend || []
  const rawFunnel = dashboardMetrics?.funnel || []
  const rawRetentionCohorts = dashboardMetrics?.retentionCohorts || dashboardMetrics?.retention_cohorts || []
  const dawTrend: DawDatum[] = rawDawTrend.map((item) => ({
    date: String(item.date || ''),
    daw: Number(item.daw || 0),
    new_wallets: Number(item.newWallets ?? item.new_wallets ?? 0),
    returning_wallets: Number(item.returningWallets ?? item.returning_wallets ?? 0),
  }))
  const funnel: FunnelDatum[] = rawFunnel.map((item) => ({
    step: Number(item.step || 0),
    label: String(item.label || ''),
    wallet_count: Number(item.walletCount ?? item.wallet_count ?? 0),
    drop_off_rate: Number(item.dropOffRate ?? item.drop_off_rate ?? 0),
  }))
  const retentionCohorts: RetentionDatum[] = rawRetentionCohorts.map((item) => ({
    cohort_week: String(item.cohortWeek ?? item.cohort_week ?? ''),
    week_number: Number(item.weekNumber ?? item.week_number ?? 0),
    wallet_count: Number(item.walletCount ?? item.wallet_count ?? 0),
    retention_rate: Number(item.retentionRate ?? item.retention_rate ?? 0),
  }))

  const totalWallets = Number(summary.totalWallets ?? summary.total_wallets ?? 0)
  const totalTransactions = Number(summary.totalTransactions ?? summary.total_transactions ?? 0)
  const avgDaw = summary.avgDailyActiveWallets ?? summary.avg_daily_active_wallets ?? '—'
  const d7Retention = Number(summary.d7RetentionRate ?? summary.d7_retention_rate ?? 0)
  const d30Retention = Number(summary.d30RetentionRate ?? summary.d30_retention_rate ?? 0)

  const truncatedAddress =
    programId.length > 12
      ? `${programId.slice(0, 6)}...${programId.slice(-4)}`
      : programId

  function copyAddress() {
    navigator.clipboard.writeText(programId)
  }

  return (
    <div className="min-h-screen">
      {/* Grid Background */}
      <div className="grid-bg"></div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/onboarding')}
            className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity text-[#7A6860]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="w-px h-6 bg-[rgba(180,140,120,0.35)]"></div>
          <div>
            <h1 className="text-base font-serif font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
              {activeProgram?.name || 'Program Analytics'}
            </h1>
            <button 
              onClick={copyAddress}
              className="text-xs font-mono flex items-center gap-1.5 hover:opacity-80 transition-opacity mt-0.5 text-[#A8978E]"
              title="Click to copy"
            >
              {truncatedAddress}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {lastSynced && (
            <span className="text-xs hidden sm:inline-flex items-center gap-1.5 text-[#7A6860]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4825A]"></span>
              Synced {lastSynced}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="btn-secondary text-xs flex items-center gap-2"
          >
            {isSyncing ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-sync
              </>
            )}
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-6 pt-24">
        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
            <span className="text-red-700 text-sm">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Loading Skeleton - Show when no metrics and not syncing */}
        {!metrics && !isSyncing && (
          <div className="card p-8 text-center relative overflow-hidden" style={{ background: '#F5EFE6' }}>
            <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at center, rgba(212,130,90,0.15) 0%, transparent 70%)' }}></div>
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-[#F2DACE]">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#B5623E' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <p className="text-base font-serif font-medium mb-2" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
                No data yet
              </p>
              <p className="text-sm mb-4 text-[#7A6860]">
                Sync your program to fetch transactions and generate metrics.
              </p>
              <button onClick={handleSync} className="btn-primary text-sm">
                Sync Your Program
              </button>
            </div>
          </div>
        )}

        {/* Metrics - Show when available */}
        {metrics && (
          <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="animate-scale-in">
            <MetricCard
              label="Total Wallets"
              value={<AnimatedNumber value={totalWallets} />}
              subtext={`${totalTransactions.toLocaleString()} transactions`}
            />
          </div>
          <div className="animate-scale-in stagger-1">
            <MetricCard
              label="Avg DAW (30d)"
              value={avgDaw}
              subtext="daily active wallets"
            />
          </div>
          <div className="animate-scale-in stagger-2">
            <MetricCard
              label="D7 Retention"
              value={d7Retention ? `${d7Retention}%` : '—'}
              subtext={d7Retention >= 25 ? 'Good for Solana' : 'Below benchmark'}
              trend={d7Retention >= 25 ? 'up' : 'down'}
            />
          </div>
          <div className="animate-scale-in stagger-3">
            <MetricCard
              label="D30 Retention"
              value={d30Retention ? `${d30Retention}%` : '—'}
              subtext={d30Retention >= 10 ? 'Healthy' : 'Needs attention'}
              trend={d30Retention >= 10 ? 'up' : 'down'}
            />
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="animate-scale-in stagger-4">
            <DAWChart data={dawTrend} />
          </div>
          <div className="animate-scale-in stagger-5">
            <FunnelChart data={funnel} />
          </div>
        </div>

        {/* Retention Grid */}
        <div className="animate-scale-in stagger-6">
          <RetentionGrid data={retentionCohorts} />
        </div>

        {/* AI Insights Call To Action */}
        <div className="animate-scale-in stagger-7">
          <div className="card relative overflow-hidden" style={{ background: '#2C2420', border: 'none' }}>
            <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at top right, #D4825A 0%, transparent 60%)' }} />
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-3xl rounded-full" />
            
            <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
                  <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">LangGraph Intelligence</span>
                </div>
                <h2 className="text-3xl font-serif text-[#FAF7F2] mb-3">
                  Uncover what's holding you back.
                </h2>
                <p className="text-[#A8978E] text-base leading-relaxed">
                  Our multi-agent AI pipeline analyzes your transaction graph to identify critical retention bottlenecks, churn triggers, and provides actionable code-level recommendations.
                </p>
              </div>
              
              <div className="shrink-0 flex flex-col items-center gap-3">
                <button
                  onClick={() => router.push(canAccess(user.plan, 'ai_insights') ? `/dashboard/${programId}/insights` : '/settings')}
                  className="px-6 py-3 rounded-xl font-medium transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                    color: '#e2e8f0',
                    border: '1px solid #334155',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  {canAccess(user.plan, 'ai_insights') ? 'Launch AI Insights' : 'Upgrade to Access ($99/mo)'}
                </button>
                {!canAccess(user.plan, 'ai_insights') && (
                  <span className="text-[10px] text-[#7A6860] uppercase tracking-widest">Requires Team Plan</span>
                )}
              </div>
            </div>
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  )
}