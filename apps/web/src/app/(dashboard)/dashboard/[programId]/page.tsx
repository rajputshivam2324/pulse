'use client'

/**
 * Main Analytics Dashboard
 * Premium Warm Design — Cream / Rose / Charcoal
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePulseStore } from '@/store'
import { MetricCard, DAWChart, FunnelChart, RetentionGrid } from '@/components/dashboard/Charts'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { canAccess } from '@/lib/plans'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

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

  const summary = ((metrics as any)?.summary as Record<string, any>) || {}
  const dawTrend = ((metrics as any)?.dawTrend || (metrics as any)?.daw_trend || []) as any[]
  const funnel = ((metrics as any)?.funnel || []) as any[]
  const retentionCohorts = ((metrics as any)?.retentionCohorts || (metrics as any)?.retention_cohorts || []) as any[]

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
        {/* Summary Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="animate-scale-in">
            <MetricCard
              label="Total Wallets"
              value={<AnimatedNumber value={summary.total_wallets || 0} />}
              subtext={`${summary.total_transactions?.toLocaleString() || 0} transactions`}
            />
          </div>
          <div className="animate-scale-in stagger-1">
            <MetricCard
              label="Avg DAW (30d)"
              value={summary.avg_daily_active_wallets || '—'}
              subtext="daily active wallets"
            />
          </div>
          <div className="animate-scale-in stagger-2">
            <MetricCard
              label="D7 Retention"
              value={summary.d7_retention_rate ? `${summary.d7_retention_rate}%` : '—'}
              subtext={summary.d7_retention_rate >= 25 ? 'Good for Solana' : 'Below benchmark'}
              trend={summary.d7_retention_rate >= 25 ? 'up' : 'down'}
            />
          </div>
          <div className="animate-scale-in stagger-3">
            <MetricCard
              label="D30 Retention"
              value={summary.d30_retention_rate ? `${summary.d30_retention_rate}%` : '—'}
              subtext={summary.d30_retention_rate >= 10 ? 'Healthy' : 'Needs attention'}
              trend={summary.d30_retention_rate >= 10 ? 'up' : 'down'}
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

        {/* AI Insights */}
        <div className="animate-scale-in stagger-7">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#F2DACE] rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#B5623E' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.167 12a4.5 4.5 0 00-3.09 3.09L.167 18.75M9.813 15.904l.846 2.846a4.5 4.5 0 003.09 3.09L18.75 21M9.813 15.904l-8.626-8.626M18.75 4.5l-8.626 8.626" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-serif font-bold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
                  AI Insights
                </h2>
                <p className="text-xs text-[#7A6860]">Powered by LangGraph</p>
              </div>
            </div>
            {!canAccess(user.plan, 'ai_insights') && !insights ? (
              <button
                onClick={() => router.push('/settings')}
                className="btn-ghost text-xs"
              >
                Upgrade to Team — $99/mo
              </button>
            ) : !insights && !isGeneratingInsights ? (
              <button
                onClick={handleGenerateInsights}
                className="btn-primary text-xs"
              >
                Generate Insights
              </button>
            ) : null}
          </div>

          {!canAccess(user.plan, 'ai_insights') && !insights ? (
            <div className="card p-8 text-center relative overflow-hidden" style={{ background: '#F5EFE6' }}>
              <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at center, rgba(212,130,90,0.15) 0%, transparent 70%)' }}></div>
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-[#F2DACE]">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#B5623E' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <p className="text-base font-serif font-medium mb-2" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
                  AI Insights require a Team plan
                </p>
                <p className="text-sm mb-4 text-[#7A6860]">
                  Upgrade to get LangGraph-powered insights on retention, churn, and what to fix.
                </p>
                <button className="btn-primary text-sm" onClick={() => router.push('/settings')}>
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