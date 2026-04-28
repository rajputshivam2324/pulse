'use client'

/**
 * Main Analytics Dashboard
 * /dashboard/[programId] — shows all metrics + AI insights for a program.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePulseStore } from '@/store'
import { MetricCard, DAWChart, FunnelChart, RetentionGrid } from '@/components/dashboard/Charts'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { canAccess } from '@/lib/plans'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

export default function DashboardPage() {
  const params = useParams()
  const router = useRouter()
  const programId = params.programId as string

  const {
    metrics,
    setMetrics,
    insights,
    setInsights,
    isSyncing,
    setSyncing,
    isGeneratingInsights,
    setGeneratingInsights,
    user,
    activeProgram,
  } = usePulseStore()

  const [lastSynced, setLastSynced] = useState<string | null>(null)

  // Load metrics on mount if not in store
  useEffect(() => {
    if (!metrics && programId) {
      fetchMetrics()
    }
  }, [programId])

  async function fetchMetrics() {
    try {
      const res = await fetch(`${API_BASE}/analytics/metrics/${programId}`)
      if (res.ok) {
        const data = await res.json()
        setMetrics(data)
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch(`${API_BASE}/analytics/sync/${programId}`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setMetrics(data.metrics)
        setLastSynced(new Date().toLocaleTimeString())
        // Also invalidate insights
        setInsights(null)
      }
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  async function handleGenerateInsights() {
    setGeneratingInsights(true)
    try {
      const res = await fetch(
        `${API_BASE}/insights/generate/${programId}?program_name=${encodeURIComponent(activeProgram?.name || programId)}`,
        { method: 'POST' }
      )
      if (res.ok) {
        const data = await res.json()
        setInsights(data)
      }
    } catch (err) {
      console.error('Insight generation failed:', err)
    } finally {
      setGeneratingInsights(false)
    }
  }

  const summary = metrics?.summary as Record<string, any> || {}
  const dawTrend = (metrics?.dawTrend || metrics?.daw_trend || []) as any[]
  const funnel = (metrics?.funnel || []) as any[]
  const retentionCohorts = (metrics?.retentionCohorts || metrics?.retention_cohorts || []) as any[]

  const truncatedAddress =
    programId.length > 12
      ? `${programId.slice(0, 6)}...${programId.slice(-4)}`
      : programId

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 glass px-6 py-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/onboarding')}
            className="text-sm"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ← Back
          </button>
          <div className="w-px h-5" style={{ background: 'var(--color-border-default)' }} />
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {activeProgram?.name || 'Program Analytics'}
            </h1>
            <p className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
              {truncatedAddress}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastSynced && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Last synced: {lastSynced}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            {isSyncing ? (
              <>
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
                Syncing...
              </>
            ) : (
              '🔄 Re-sync'
            )}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
          <MetricCard
            label="Total Wallets"
            value={summary.total_wallets?.toLocaleString() || '—'}
            subtext={`${summary.total_transactions?.toLocaleString() || 0} transactions`}
          />
          <MetricCard
            label="Avg DAW (30d)"
            value={summary.avg_daily_active_wallets || '—'}
            subtext="daily active wallets"
          />
          <MetricCard
            label="D7 Retention"
            value={summary.d7_retention_rate ? `${summary.d7_retention_rate}%` : '—'}
            subtext={summary.d7_retention_rate >= 25 ? 'Good for Solana' : 'Below benchmark'}
            trend={summary.d7_retention_rate >= 25 ? 'up' : 'down'}
          />
          <MetricCard
            label="D30 Retention"
            value={summary.d30_retention_rate ? `${summary.d30_retention_rate}%` : '—'}
            subtext={summary.d30_retention_rate >= 10 ? 'Healthy' : 'Needs attention'}
            trend={summary.d30_retention_rate >= 10 ? 'up' : 'down'}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <DAWChart data={dawTrend} />
          <FunnelChart data={funnel} />
        </div>

        {/* Retention Grid */}
        <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <RetentionGrid data={retentionCohorts} />
        </div>

        {/* AI Insights */}
        <div className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                AI Insights
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-brand-subtle)', color: 'var(--color-brand-light)' }}>
                LangGraph
              </span>
            </div>
            {!insights && !isGeneratingInsights && (
              <button
                onClick={handleGenerateInsights}
                className="btn-primary text-xs"
              >
                ✨ Generate Insights
              </button>
            )}
          </div>

          {!canAccess(user.plan, 'ai_insights') && !insights ? (
            <div className="card p-8 text-center relative overflow-hidden">
              <div
                className="absolute inset-0"
                style={{ background: 'var(--color-bg-card)', opacity: 0.8 }}
              />
              <div className="relative z-10">
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
                  🔒 AI Insights require a Team plan
                </p>
                <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Upgrade to get LangGraph-powered insights on retention, churn, and what to fix.
                </p>
                <button className="btn-primary text-xs" onClick={() => router.push('/settings')}>
                  Upgrade to Team — $99/mo in USDC
                </button>
              </div>
            </div>
          ) : (
            <InsightsPanel data={insights as any} isLoading={isGeneratingInsights} />
          )}
        </div>
      </main>
    </div>
  )
}
