'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { usePulseStore } from '@/store'
import { canAccess } from '@/lib/plans'
import { buildUpgradeUrl } from '@/lib/upgrade'
import { useShallow } from 'zustand/react/shallow'
import {
  healthGrade,
  ImpactCard,
  MiniDAWTrend,
  MiniFunnel,
  RetentionByTypeBar,
  RetentionByTypeTable,
  type TypeRetentionRow,
} from '@/components/dashboard/Charts'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

type AnyRecord = Record<string, unknown>

type InsightItem = {
  id?: string
  finding?: string
  why_it_matters?: string
  whyItMatters?: string
  severity?: string
  recommendation?: string
  metric_reference?: string
  metricReference?: string
}

type HistoryReport = {
  id?: string
  generated_at?: string
  generatedAt?: string
  health_score?: number
  healthScore?: number
  headline?: string
}

type StreamState = {
  active: boolean
  status?: string
  partialReport?: AnyRecord | null
  partialInsights?: InsightItem[]
  error?: string | null
}

const SEVERITY_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
  critical: { label: 'Critical', dot: '#dc2626', bg: 'rgba(220,38,38,0.08)', text: '#991b1b', border: 'rgba(220,38,38,0.24)' },
  high: { label: 'High', dot: '#d97706', bg: 'rgba(217,119,6,0.09)', text: '#92400e', border: 'rgba(217,119,6,0.26)' },
  medium: { label: 'Medium', dot: '#2563eb', bg: 'rgba(37,99,235,0.08)', text: '#1e3a8a', border: 'rgba(37,99,235,0.22)' },
  low: { label: 'Low', dot: '#64748b', bg: 'rgba(100,116,139,0.08)', text: '#475569', border: 'rgba(100,116,139,0.22)' },
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`
}

function formatDateTime(value?: string | null): string {
  if (!value) return new Date().toLocaleString()
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return new Date().toLocaleString()
  return d.toLocaleString()
}

function shortMetricLabel(value?: string): string {
  if (!value) return 'metric'
  return value.replace(/_/g, ' ').slice(0, 34)
}

function normalizeMetrics(raw: AnyRecord | null) {
  const metrics = raw || {}
  const summary = (metrics.summary || {}) as AnyRecord
  const rawFunnel = (metrics.funnel || []) as AnyRecord[]
  const rawDaw = (metrics.dawTrend || metrics.daw_trend || []) as AnyRecord[]
  const rawPerType = (metrics.perTypeRetention || metrics.per_type_retention || []) as AnyRecord[]
  const rawDropOff = (metrics.dropOffByType || metrics.drop_off_by_type || []) as AnyRecord[]

  const d7 = num(summary.d7RetentionRate ?? summary.d7_retention_rate)
  const d30 = num(summary.d30RetentionRate ?? summary.d30_retention_rate)
  const totalWallets = num(summary.totalWallets ?? summary.total_wallets)
  const totalTransactions = num(summary.totalTransactions ?? summary.total_transactions)
  const avgDaw = num(summary.avgDailyActiveWallets ?? summary.avg_daily_active_wallets)
  const worstFunnelDrop = num(summary.worstFunnelDropRate ?? summary.worst_funnel_drop_rate)
  const oneAndDone = Math.max(0, Math.round(totalWallets * (1 - d7 / 100)))
  const d30Ratio = d7 > 0 ? Math.min(1, Math.max(0.15, d30 / d7)) : 0.4

  const funnel = rawFunnel.map((row: AnyRecord) => ({
    step: num(row.step),
    label: String(row.label || ''),
    wallet_count: num(row.walletCount ?? row.wallet_count),
    drop_off_rate: num(row.dropOffRate ?? row.drop_off_rate),
  }))

  const dawTrend = rawDaw.map((row: AnyRecord) => ({
    date: String(row.date || ''),
    daw: num(row.daw),
    new_wallets: num(row.newWallets ?? row.new_wallets),
    returning_wallets: num(row.returningWallets ?? row.returning_wallets),
  }))

  const dropMap = new Map<string, AnyRecord>()
  rawDropOff.forEach((row: AnyRecord) => {
    const type = String(row.transactionType ?? row.transaction_type ?? row.type ?? '').toUpperCase()
    if (type) dropMap.set(type, row)
  })

  const retentionRows: TypeRetentionRow[] = rawPerType.map((row: AnyRecord) => {
    const type = String(row.firstTransactionType ?? row.first_transaction_type ?? row.transactionType ?? row.transaction_type ?? row.type ?? 'UNKNOWN').toUpperCase()
    const total = num(row.totalWallets ?? row.total_wallets)
    const returned = num(row.returnedWallets ?? row.returned_wallets)
    const rate = num(row.returnRate ?? row.return_rate)
    const drop = dropMap.get(type)
    const oneTime = num(drop?.oneTimeCount ?? drop?.one_time_count)
    const repeat = num(drop?.repeatCount ?? drop?.repeat_count)
    const txBase = oneTime + repeat
    const avgTxns = txBase > 0 ? (oneTime + repeat * 2.2) / txBase : total > 0 ? (total + returned) / total : undefined

    return {
      type,
      total_wallets: total,
      returned_wallets: returned,
      return_rate: Math.round(rate),
      d30_return_rate: Math.round(rate * d30Ratio),
      avg_txns: avgTxns,
      churn_rate: num(drop?.churnRate ?? drop?.churn_rate),
    }
  })

  return {
    summary,
    d7,
    d30,
    totalWallets,
    totalTransactions,
    avgDaw,
    worstFunnelDrop,
    oneAndDone,
    funnel,
    dawTrend,
    retentionRows,
  }
}

function anomalyChips(insight: InsightItem, retentionRows: TypeRetentionRow[]) {
  const metric = `${insight.metricReference ?? insight.metric_reference ?? ''} ${insight.finding ?? ''}`.toLowerCase()
  const bestType = retentionRows[0]?.type || 'the best retained action'
  const worstType = retentionRows[retentionRows.length - 1]?.type || 'the weakest action'

  if (metric.includes('retention') || metric.includes('return') || metric.includes('churn')) {
    return [
      `Why does ${bestType} retain better?`,
      `What do ${worstType} wallets do next?`,
      'Which wallets should we re-engage?',
    ]
  }
  if (metric.includes('funnel') || metric.includes('drop') || metric.includes('step')) {
    return [
      'What causes the biggest funnel loss?',
      'Fastest fix for step 1 to 2?',
      'What would healthy conversion look like?',
    ]
  }
  if (metric.includes('daw') || metric.includes('daily') || metric.includes('active')) {
    return [
      'Why is DAW moving this way?',
      'Which actions create returners?',
      'How do we lift daily activity?',
    ]
  }
  return [
    'What is the root cause?',
    'What should we fix first?',
    'Which metric proves this?',
  ]
}

function mergeReport(existing: AnyRecord | null, patch: AnyRecord) {
  return { ...(existing || {}), ...(patch || {}) }
}

async function consumeSseResponse(
  res: Response,
  onEvent: (event: string, data: AnyRecord) => void,
  signal?: AbortSignal
) {
  if (!res.body) throw new Error('Streaming not supported by this browser.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  const isAborted = () => Boolean(signal?.aborted)

  while (true) {
    if (isAborted()) return
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE records are separated by blank line
    let idx = buffer.indexOf('\n\n')
    while (idx !== -1) {
      const raw = buffer.slice(0, idx).trimEnd()
      buffer = buffer.slice(idx + 2)
      idx = buffer.indexOf('\n\n')

      if (!raw) continue
      let eventName = 'message'
      let dataJson = ''

      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) dataJson += line.slice(5).trim()
      }

      if (!dataJson) continue
      try {
        const data = JSON.parse(dataJson) as AnyRecord
        onEvent(eventName, data)
      } catch {
        // ignore malformed chunk
      }
    }
  }
}

export default function AIInsightsPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const programId = params.programId as string
  const hasAttempted = useRef(false)
  const idleRetryCount = useRef(0)

  // IMPORTANT: use selectors (with shallow) to avoid rerendering the entire page
  // on any unrelated Zustand state change. This page renders heavy charts/tables.
  const { user, activeProgram, isGeneratingInsights } = usePulseStore(useShallow(
    (s) => ({
      user: s.user,
      activeProgram: s.activeProgram,
      isGeneratingInsights: s.isGeneratingInsights,
    }),
  ))

  const { insightsByProgram, metricsByProgram } = usePulseStore(useShallow(
    (s) => ({ insightsByProgram: s.insightsByProgram, metricsByProgram: s.metricsByProgram }),
  ))

  const { setInsights, setMetrics, setGeneratingInsights } = usePulseStore(useShallow(
    (s) => ({
      setInsights: s.setInsights,
      setMetrics: s.setMetrics,
      setGeneratingInsights: s.setGeneratingInsights,
    }),
  ))

  const insights = programId ? insightsByProgram[programId] : null
  const metrics = programId ? metricsByProgram[programId] : null
  const hasAccess = canAccess(user.plan, 'ai_insights')

  const [error, setError] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState(0)
  const [history, setHistory] = useState<HistoryReport[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [stream, setStream] = useState<StreamState>({ active: false, partialReport: null, partialInsights: [], error: null })
  const streamAbort = useRef<AbortController | null>(null)

  const normalizedMetrics = useMemo(() => normalizeMetrics(metrics as AnyRecord | null), [metrics])
  const insightList = useMemo(() => ((insights?.insights || []) as InsightItem[]), [insights])
  const healthScore = num(insights?.healthScore ?? insights?.health_score)
  const grade = healthGrade(healthScore)
  const generatedAt = insights?.generatedAt || insights?.generated_at
  const headline = insights?.headline || 'AI intelligence report ready'
  const biggestProblem = insights?.biggestProblem || insights?.biggest_problem
  const quickWins = (insights?.quickWins || insights?.quick_wins || []) as string[]
  const retentionDiagnosis = (insights?.retentionDiagnosis || insights?.retention_diagnosis || null) as AnyRecord | null
  const suggestedFromInsights = useMemo(
    () => ((insights?.suggestedQuestions || insights?.suggested_questions || []) as string[]),
    [insights?.suggestedQuestions, insights?.suggested_questions]
  )
  const baseSuggestions = useMemo(() => {
    if (suggestedFromInsights.length) return suggestedFromInsights.slice(0, 4)
    if (insightList.length) return anomalyChips(insightList[0], normalizedMetrics.retentionRows).slice(0, 4)
    return []
  }, [insightList, normalizedMetrics.retentionRows, suggestedFromInsights])
  const visibleSuggestions = baseSuggestions

  const fetchHistory = useCallback(async () => {
    if (!user.token || !programId) return
    try {
      const res = await fetch(`${API_BASE}/insights/history/${programId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setHistory(data.reports || [])
    } catch (err) {
      console.warn('Failed to load insight history:', err)
    }
  }, [programId, user.token])

  const fetchMetrics = useCallback(async () => {
    if (!user.token || !programId) return
    try {
      const res = await fetch(`${API_BASE}/analytics/metrics/${programId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) setMetrics(programId, await res.json())
    } catch (err) {
      console.warn('Failed to load metrics for insight evidence:', err)
    }
  }, [programId, setMetrics, user.token])

  const handleGenerateInsights = useCallback(async () => {
    if (!user.token || !programId) return
    setGeneratingInsights(true)
    setError(null)
    setStream({ active: true, partialReport: null, partialInsights: [], status: 'starting', error: null })

    // Cancel any previous stream
    try { streamAbort.current?.abort() } catch {}
    const abort = new AbortController()
    streamAbort.current = abort
    try {
      // Best UX: stream via SSE over fetch (supports Authorization header).
      const streamRes = await fetch(
        `${API_BASE}/insights/generate_stream/${programId}?program_name=${encodeURIComponent(activeProgram?.name || programId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${user.token}`,
            Accept: 'text/event-stream',
          },
          signal: abort.signal,
        }
      )

      if (!streamRes.ok) {
        const errData = await streamRes.json().catch(() => ({}))
        const detail = String(errData.detail || errData.error || '')
        if (streamRes.status === 403 || detail.toLowerCase().includes('upgrade')) {
          setError('locked')
          return
        }
        throw new Error(detail || 'Failed to start streaming insights.')
      }

      await consumeSseResponse(
        streamRes,
        (evt, data) => {
          if (evt === 'status') {
            setStream((s) => ({ ...s, status: String(data.status || 'working') }))
            return
          }
          if (evt === 'insight') {
            const insight = (data.insight || null) as InsightItem | null
            if (!insight) return
            setStream((s) => ({
              ...s,
              partialInsights: [...(s.partialInsights || []), insight],
              partialReport: mergeReport(s.partialReport || null, { insights: [...(s.partialInsights || []), insight] }),
            }))
            return
          }
          if (evt === 'final') {
            const report = (data.report || null) as AnyRecord | null
            if (!report) return
            const normalizedReport: Record<string, unknown> & { insights: Record<string, unknown>[] } = {
              ...report,
              insights: Array.isArray(report.insights) ? (report.insights as Record<string, unknown>[]) : [],
            }
            setInsights(programId, normalizedReport as never)
            setStream((s) => ({ ...s, active: false, status: 'done', partialReport: null, partialInsights: [] }))
            void fetchHistory()
          }
          if (evt === 'error') {
            const streamError = typeof data.error === 'string' ? data.error : 'Streaming error'
            setStream((s) => ({ ...s, error: streamError }))
          }
        },
        abort.signal
      )
    } catch (err) {
      console.error('Insight generation failed:', err)
      const message = err instanceof Error ? err.message : 'Network error occurred.'
      setError(message)
      setStream((s) => ({ ...s, active: false, error: message }))
    } finally {
      setGeneratingInsights(false)
    }
  }, [activeProgram, fetchHistory, programId, setGeneratingInsights, setInsights, user.token])

  const loadCachedOrGenerate = useCallback(async () => {
    if (!user.token || !programId) return
    try {
      const res = await fetch(`${API_BASE}/insights/${programId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) {
        setInsights(programId, await res.json())
        void fetchHistory()
        return
      }
      if (res.status === 403) {
        setError('locked')
        return
      }
      if (res.status === 404) {
        await handleGenerateInsights()
        return
      }
      const errData = await res.json().catch(() => ({}))
      setError(errData.detail || errData.error || 'Failed to load insights.')
    } catch {
      await handleGenerateInsights()
    }
  }, [fetchHistory, handleGenerateInsights, programId, setInsights, user.token])

  function handleChipClick(question: string) {
    router.push(`/dashboard/${programId}/insights/chat?q=${encodeURIComponent(question)}`)
  }

  useEffect(() => {
    if (hasAccess && !metrics && user.token && programId) {
      const t = window.setTimeout(() => { void fetchMetrics() }, 0)
      return () => window.clearTimeout(t)
    }
  }, [fetchMetrics, hasAccess, metrics, programId, user.token])

  useEffect(() => {
    if (hasAccess && user.token && programId) {
      const t = window.setTimeout(() => { void fetchHistory() }, 0)
      return () => window.clearTimeout(t)
    }
  }, [fetchHistory, hasAccess, programId, user.token])

  useEffect(() => {
    // Critical: don't "attempt" until we actually have a token; otherwise we can
    // lock ourselves into a forever-loading state after hydration.
    if (hasAccess && user.token && programId && !insights && !isGeneratingInsights && !error && !hasAttempted.current) {
      hasAttempted.current = true
      const auto = searchParams.get('auto') === '1'
      const t = window.setTimeout(() => { void (auto ? handleGenerateInsights() : loadCachedOrGenerate()) }, 0)
      return () => window.clearTimeout(t)
    }
  }, [error, handleGenerateInsights, hasAccess, insights, isGeneratingInsights, loadCachedOrGenerate, programId, searchParams, user.token])

  useEffect(() => {
    // Failsafe for rare idle state where no report renders and generation is inactive.
    if (!hasAccess || !user.token || !programId || insights || isGeneratingInsights || error || !hasAttempted.current) return
    if (idleRetryCount.current >= 2) return

    const t = window.setTimeout(() => {
      idleRetryCount.current += 1
      void loadCachedOrGenerate()
    }, 2200)
    return () => window.clearTimeout(t)
  }, [error, hasAccess, insights, isGeneratingInsights, loadCachedOrGenerate, programId, user.token])

  useEffect(() => {
    if (!isGeneratingInsights) return
    const interval = window.setInterval(() => {
      setScanProgress((p) => (p >= 100 ? 0 : p + Math.random() * 5))
    }, 100)
    return () => window.clearInterval(interval)
  }, [isGeneratingInsights])

  const headerElement = (
    <header className="fixed top-0 left-0 right-0 z-50 machined-panel px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={() => router.push(`/dashboard/${programId}`)}
          className="flex items-center gap-2 f1-m text-[10px] uppercase tracking-widest text-black/60 hover:text-black transition-colors shrink-0"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </button>
        <div className="w-px h-6 bg-black/20 shadow-[1px_0_0_rgba(255,255,255,0.3)]" />
        <div className="min-w-0">
          <h1 className="text-sm f1-h font-bold text-black/80 uppercase truncate">
            AI Intelligence Report
          </h1>
          <div className="text-[10px] f1-m flex items-center gap-1.5 mt-0.5 text-black/60 uppercase tracking-widest truncate">
            {activeProgram?.name || programId}
          </div>
        </div>
      </div>
      <span className="text-[10px] hidden sm:inline-flex items-center gap-1.5 text-black/60 f1-m uppercase tracking-widest">
        <span className="status-dot on" />
        LangGraph Active
      </span>
    </header>
  )

  if (!hasAccess || error === 'locked') {
    const returnTo = `/dashboard/${programId}/insights`
    return (
      <div className="min-h-screen relative overflow-hidden">
        {headerElement}
        <div className="flex items-center justify-center min-h-screen px-6 pt-24 pb-20">
          <div className="plate p-10 max-w-xl w-full text-center">
            <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-4 border border-black/10">
              <span className="text-2xl">🔒</span>
            </div>
            <h2 className="text-xl f1-h font-bold mb-2 text-black/80 uppercase">AI Insights Locked</h2>
            <p className="text-black/60 text-xs f1-m uppercase tracking-widest mb-6">
              Upgrade to Team or Protocol to generate AI intelligence reports and follow-up chat.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => router.push(buildUpgradeUrl(returnTo))} className="btn-hero">
                <span className="btn-label">Upgrade in Account</span>
              </button>
              <button onClick={() => router.push(`/dashboard/${programId}`)} className="btn-ghost">
                <span className="btn-label">Back to Dashboard</span>
              </button>
            </div>
            <p className="mt-5 text-[9px] f1-m uppercase tracking-widest text-black/35">
              After upgrading, return here to run AI Insights.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !insights) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {headerElement}
        <div className="flex items-center justify-center min-h-screen px-6 pt-24 pb-20">
          <div className="plate p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-4 border border-black/10">
              <span className="text-2xl">!</span>
            </div>
            <h2 className="text-xl f1-h font-bold mb-2 text-red-700 uppercase">Generation Failed</h2>
            <p className="text-black/60 text-xs f1-m uppercase tracking-widest mb-6">{error}</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => router.push(`/dashboard/${programId}`)} className="btn-ghost">
                <span className="btn-label">Abort</span>
              </button>
              <button onClick={() => void handleGenerateInsights()} className="btn-hero">
                <span className="btn-label">Retry</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isGeneratingInsights || (!insights && hasAccess)) {
    const idleState = !isGeneratingInsights && !stream.active
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col">
        {headerElement}
        <main className="flex-1 relative z-10 flex flex-col items-center justify-center p-8 pt-24">
          <div className="relative w-full max-w-2xl animate-fade-in">
            <div className="plate p-12 text-center overflow-hidden">
              <div
                className="absolute left-0 right-0 h-[2px] bg-green-500 shadow-[0_0_10px_2px_rgba(34,197,94,0.3)] opacity-70"
                style={{ top: `${scanProgress}%`, transition: 'top 0.1s linear' }}
              />
              <div className="mb-8 relative inline-block">
                <div className="w-24 h-24 rounded-full border-2 border-black/10 flex items-center justify-center relative z-10 bg-black/5 shadow-[inset_0_4px_8px_rgba(0,0,0,0.1)]">
                  <svg className="w-10 h-10 text-black/40 animate-[spin_4s_linear_infinite]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                    <circle cx="12" cy="12" r="10" strokeDasharray="16 16" />
                    <circle cx="12" cy="12" r="6" strokeDasharray="8 8" className="text-green-600" />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl f1-h font-bold text-black/80 mb-2 uppercase tracking-wide">
                Building Report
              </h2>
              <p className="text-black/50 text-xs f1-m uppercase tracking-widest mb-5 max-w-md mx-auto">
                {stream.active ? `Live: ${stream.status || 'starting'}` : 'AI pass runs first. Metrics fallback returns automatically if model is slow.'}
              </p>
              <div className="grid grid-cols-3 gap-2 max-w-md mx-auto mb-8">
                {[
                  ['1', 'Read metrics'],
                  ['2', 'Rank anomalies'],
                  ['3', 'Return report'],
                ].map(([step, label], idx) => {
                  const active = scanProgress >= idx * 28
                  return (
                    <div key={step} className="rounded-sm border border-black/10 bg-black/[0.03] px-3 py-2 text-left">
                      <div className="text-[9px] f1-h font-bold" style={{ color: active ? '#16a34a' : 'rgba(0,0,0,0.35)' }}>{step}</div>
                      <div className="text-[8px] f1-m uppercase tracking-widest text-black/45 truncate">{label}</div>
                    </div>
                  )
                })}
              </div>
              <div className="w-full max-w-sm mx-auto h-1 bg-black/10 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]">
                <div
                  className="h-full bg-gradient-to-r from-black/20 via-black/40 to-black/60 rounded-full"
                  style={{ width: `${Math.min(scanProgress + 15, 100)}%`, transition: 'width 0.3s ease-out' }}
                />
              </div>
              <p className="mt-4 text-[9px] f1-m uppercase tracking-widest text-black/35">
                Hard timeout: 25s. No more minute-long blank wait.
              </p>
              {idleState && (
                <div className="mt-4">
                  <button
                    onClick={() => void loadCachedOrGenerate()}
                    className="btn text-[10px] uppercase tracking-widest"
                  >
                    <span className="btn-label">Retry Loading Now</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!insights) return null

  const scoreColor = healthScore >= 65 ? '#16a34a' : healthScore >= 35 ? '#d97706' : '#dc2626'
  const scoreTrail = history
    .slice()
    .reverse()
    .map((r) => num(r.healthScore ?? r.health_score))
    .filter((v) => v > 0)
  const recoveryWallets = Math.round(normalizedMetrics.oneAndDone * 0.1)
  const retentionGap = Math.max(0, 25 - normalizedMetrics.d7)
  const dawLift = normalizedMetrics.avgDaw > 0 ? '2x' : '+1.5x'
  const impactCards = [
    {
      metric: `+${recoveryWallets.toLocaleString()}`,
      description: quickWins[0] || 'wallets if 10% of one-time users return',
      effort: '1 day',
    },
    {
      metric: retentionGap > 0 ? `+${Math.round(retentionGap)}%` : 'On pace',
      description: quickWins[1] || 'D7 retention gap to Solana DeFi benchmark',
      effort: '1 week',
    },
    {
      metric: dawLift,
      description: quickWins[2] || 'DAW upside if worst funnel step is repaired',
      effort: '1 day',
    },
  ]

  return (
    <div className="min-h-screen relative overflow-hidden">
      {headerElement}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-6 pt-24 pb-20 animate-fade-in">
        {error && (
          <div className="plate p-3 flex items-center justify-between border-l-4 border-red-500">
            <span className="text-red-700 f1-m text-[10px] uppercase tracking-widest font-bold">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600" aria-label="Dismiss error">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <section className="plate px-5 py-4">
          <button
            onClick={() => setHistoryOpen((open) => !open)}
            className="w-full flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-black/40 f1-m text-xs">{historyOpen ? 'v' : '>'}</span>
              <span className="f1-h text-sm font-bold uppercase text-black/75">Previous Reports</span>
              <span className="tag">{history.length} reports</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] f1-m uppercase tracking-widest text-black/45">
                Score trail: {scoreTrail.length ? scoreTrail.join(' -> ') : `${healthScore}`}
              </span>
              <div className="hidden sm:flex items-end gap-1 h-7">
                {(scoreTrail.length ? scoreTrail : [healthScore]).map((score, i) => (
                  <span
                    key={`${score}-${i}`}
                    className="w-1.5 rounded-sm bg-black/35"
                    style={{ height: `${Math.max(6, Math.min(28, score / 3))}px` }}
                  />
                ))}
              </div>
            </div>
          </button>
          {historyOpen && (
            <div className="mt-4 border-t border-black/10 pt-3 space-y-2">
              {history.length === 0 ? (
                <div className="text-[10px] f1-m uppercase tracking-widest text-black/35">No prior reports yet</div>
              ) : history.map((report) => (
                <div key={report.id || report.generated_at || report.generatedAt} className="flex items-center justify-between gap-4 py-2 border-b border-black/5 last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs f1-m text-black/70 truncate">{report.headline || 'Untitled insight report'}</p>
                    <p className="text-[9px] f1-m uppercase tracking-widest text-black/35">{formatDateTime(report.generatedAt || report.generated_at)}</p>
                  </div>
                  <span className="tag shrink-0">Score {num(report.healthScore ?? report.health_score)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="plate px-5 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-4 items-center">
            <div className="min-w-0">
              <p className="text-[10px] f1-m uppercase tracking-widest text-black/40 mb-1">Executive Summary</p>
              <h2 className="text-xl md:text-2xl f1-h font-bold text-black/80 truncate">{headline}</h2>
              {biggestProblem && (
                <p className="text-xs f1-m text-black/55 mt-2 line-clamp-2">{biggestProblem}</p>
              )}
            </div>
            <div className="flex items-center gap-4 lg:justify-end">
              <div className="text-right">
                <div className="text-[10px] f1-m uppercase tracking-widest text-black/40">Health</div>
                <div className="flex items-end gap-2">
                  <span className="f1-h text-4xl font-black" style={{ color: scoreColor }}>{healthScore}</span>
                  <span className="f1-h text-lg font-bold text-black/45 pb-1">/{grade}</span>
                </div>
              </div>
              <div className="hidden md:block w-px h-12 bg-black/10" />
              <div className="text-left md:text-right">
                <div className="text-[10px] f1-m uppercase tracking-widest text-black/40">Generated</div>
                <div className="text-[11px] f1-m font-bold text-black/65">{formatDateTime(generatedAt)}</div>
              </div>
            </div>
            <button
              onClick={() => void handleGenerateInsights()}
              disabled={isGeneratingInsights}
              className="btn-hero text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <svg className={`w-3.5 h-3.5 ${isGeneratingInsights ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="btn-label">Regenerate</span>
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-black/40 rounded-full" />
              <h3 className="text-xl f1-h font-bold text-black/80 uppercase">Critical Anomalies</h3>
            </div>
            <span className="tag">{insightList.length} findings</span>
          </div>

          <div className="space-y-5">
            {insightList.map((insight, idx) => {
              const severity = (insight.severity || 'low').toLowerCase()
              const conf = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low
              const metricText = `${insight.metricReference ?? insight.metric_reference ?? ''} ${insight.finding ?? ''}`.toLowerCase()
              const wantsRetention = metricText.includes('retention') || metricText.includes('return') || metricText.includes('churn')
              const wantsFunnel = metricText.includes('funnel') || metricText.includes('drop') || metricText.includes('step')
              const wantsDaw = metricText.includes('daw') || metricText.includes('daily') || metricText.includes('active')
              const chips = anomalyChips(insight, normalizedMetrics.retentionRows)
              const showRetention = wantsRetention || (!wantsFunnel && !wantsDaw)
              const showFunnel = wantsFunnel || (!wantsRetention && !wantsDaw)

              return (
                <article key={insight.id || idx} className="plate overflow-hidden">
                  <div className="px-5 py-4 border-b border-black/10" style={{ background: conf.bg, borderColor: conf.border }}>
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      <div className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border f1-m text-[10px] uppercase tracking-widest font-bold w-fit" style={{ color: conf.text, borderColor: conf.border, background: 'rgba(255,255,255,0.45)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: conf.dot }} />
                        {conf.label}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg md:text-xl f1-h font-bold text-black/80 leading-snug">
                          {insight.finding || 'Anomaly detected'}
                        </h4>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="tag">{shortMetricLabel(insight.metricReference ?? insight.metric_reference)}</span>
                          {insight.whyItMatters || insight.why_it_matters ? (
                            <span className="text-[10px] f1-m text-black/50 leading-relaxed">{insight.whyItMatters || insight.why_it_matters}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 border-b border-black/10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {showRetention && <RetentionByTypeBar data={normalizedMetrics.retentionRows} />}
                      {showFunnel && <MiniFunnel data={normalizedMetrics.funnel} />}
                      {wantsDaw && <MiniDAWTrend data={normalizedMetrics.dawTrend} />}
                      {!showRetention && !showFunnel && !wantsDaw && (
                        <div className="bg-black/[0.03] rounded-sm border border-black/10 p-3 text-[10px] f1-m uppercase tracking-widest text-black/35">
                          Metrics evidence will appear after sync
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                    <div className="flex items-start gap-3">
                      <svg className="w-4 h-4 shrink-0 mt-0.5 text-black/45" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <p className="text-sm f1-m font-bold text-black/70 leading-relaxed">
                        {insight.recommendation || 'Review this metric and test a targeted product change this week.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {chips.map((chip) => (
                        <button
                          key={chip}
                          onClick={() => handleChipClick(chip)}
                          className="px-3 py-2 rounded-sm border border-black/10 bg-black/[0.03] hover:bg-black/[0.06] text-[10px] f1-m uppercase tracking-widest text-black/60 hover:text-black transition-colors disabled:opacity-50"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_.8fr] gap-5">
          <RetentionByTypeTable data={normalizedMetrics.retentionRows} />
          <div className="plate p-5">
            <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
              <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Retention Diagnosis</h3>
              {Boolean(retentionDiagnosis?.retention_grade) && <span className="tag">Grade {String(retentionDiagnosis?.retention_grade)}</span>}
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-sm border border-black/10 bg-black/[0.03]">
                <p className="text-[9px] f1-m uppercase tracking-widest text-black/35 mb-1">Churn Trigger</p>
                <p className="text-xs f1-m text-black/70 leading-relaxed">{String(retentionDiagnosis?.main_churn_trigger || 'No retention diagnosis available yet.')}</p>
              </div>
              <div className="p-3 rounded-sm border border-black/10 bg-black/[0.03]">
                <p className="text-[9px] f1-m uppercase tracking-widest text-black/35 mb-1">Power User Signal</p>
                <p className="text-xs f1-m text-black/70 leading-relaxed">{String(retentionDiagnosis?.power_user_signal || 'Generate insights after metrics sync to identify power-user behavior.')}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-sm border border-black/10 bg-black/[0.03] text-center">
                  <p className="f1-h text-xl font-bold text-black/80">{formatPct(normalizedMetrics.d7)}</p>
                  <p className="text-[8px] f1-m uppercase tracking-widest text-black/35">D7</p>
                </div>
                <div className="p-3 rounded-sm border border-black/10 bg-black/[0.03] text-center">
                  <p className="f1-h text-xl font-bold text-black/80">{formatPct(normalizedMetrics.d30)}</p>
                  <p className="text-[8px] f1-m uppercase tracking-widest text-black/35">D30</p>
                </div>
                <div className="p-3 rounded-sm border border-black/10 bg-black/[0.03] text-center">
                  <p className="f1-h text-xl font-bold text-black/80">{formatPct(normalizedMetrics.worstFunnelDrop)}</p>
                  <p className="text-[8px] f1-m uppercase tracking-widest text-black/35">Drop</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-black/40 rounded-full" />
            <h3 className="text-xl f1-h font-bold text-black/80 uppercase">Immediate Impact</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {impactCards.map((card) => (
              <ImpactCard key={card.metric} metric={card.metric} description={card.description} effort={card.effort} />
            ))}
          </div>
        </section>

        <section className="plate p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5 border-b border-black/10 pb-4">
            <div>
              <p className="text-[10px] f1-m uppercase tracking-widest text-black/40 mb-1">Follow-up Chat</p>
              <h3 className="text-xl f1-h font-bold text-black/80 uppercase">Open Full Chat Workspace</h3>
            </div>
            <button
              onClick={() => router.push(`/dashboard/${programId}/insights/chat`)}
              className="btn-hero text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <span className="btn-label">Open Chat</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
          <div className="rounded-sm border border-black/10 bg-black/[0.03] p-4 text-xs f1-m text-black/55 mb-4">
            Follow-up now opens in a dedicated page so you can iterate on longer conversations with clearer formatting and context.
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleChipClick(suggestion)}
                className="px-3 py-2 rounded-sm border border-black/10 bg-black/[0.03] hover:bg-black/[0.06] text-[10px] f1-m uppercase tracking-widest text-black/60 hover:text-black transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
