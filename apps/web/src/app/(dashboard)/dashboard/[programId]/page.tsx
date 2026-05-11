'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePulseStore } from '@/store'
import {
  MetricCard, HealthScore, DAWChart, FunnelChart, RetentionGrid,
  WalletSegments, ActivityHeatmap, WhaleTable, SignalFeed, DropOffBreakdown,
} from '@/components/dashboard/Charts'
import { canAccess } from '@/lib/plans'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

type MetricSummary = Record<string, number | string | undefined>
type ChartDatum = Record<string, number | string | null | undefined>

type DashboardMetrics = {
  summary?: MetricSummary
  dawTrend?: ChartDatum[]; daw_trend?: ChartDatum[]
  funnel?: ChartDatum[]
  retentionCohorts?: ChartDatum[]; retention_cohorts?: ChartDatum[]
  activityHeatmap?: Array<{ hour: number; day: number; count: number }>; activity_heatmap?: Array<{ hour: number; day: number; count: number }>
  whales?: Array<{ address: string; txns: number; volume_sol: number; share_pct: number }>
  dropOffBreakdown?: Array<{ label: string; value: number }>; drop_off_breakdown?: Array<{ label: string; value: number }>
}

type TimeRange = '7D' | '30D' | '90D' | 'ALL'

type TxnRecord = {
  wallet_address?: string
  walletAddress?: string
  timestamp?: string
}

const RANGE_OPTIONS: TimeRange[] = ['7D', '30D', '90D', 'ALL']

function rangeDays(range: TimeRange): number | null {
  if (range === '7D') return 7
  if (range === '30D') return 30
  if (range === '90D') return 90
  return null
}

function filterDawByRange(
  data: Array<{ date: string; daw: number; new_wallets: number; returning_wallets: number }>,
  range: TimeRange
) {
  if (range === 'ALL') return data
  const days = rangeDays(range) ?? 30
  return data.slice(-days)
}

function buildRangeFunnel(transactions: TxnRecord[], range: TimeRange) {
  const now = Date.now()
  const days = rangeDays(range)
  const cutoff = days ? now - days * 24 * 60 * 60 * 1000 : null
  const countsByWallet = new Map<string, number>()

  for (const txn of transactions) {
    const wallet = String(txn.walletAddress || txn.wallet_address || '').trim()
    if (!wallet) continue
    const tsRaw = txn.timestamp
    const ts = tsRaw ? new Date(tsRaw).getTime() : NaN
    if (cutoff && Number.isFinite(ts) && ts < cutoff) continue
    if (cutoff && !Number.isFinite(ts)) continue
    countsByWallet.set(wallet, (countsByWallet.get(wallet) || 0) + 1)
  }

  const stepWallets = [0, 0, 0, 0]
  countsByWallet.forEach((count) => {
    if (count >= 1) stepWallets[0] += 1
    if (count >= 2) stepWallets[1] += 1
    if (count >= 3) stepWallets[2] += 1
    if (count >= 5) stepWallets[3] += 1
  })

  return [
    { step: 1, label: '1st Transaction', wallet_count: stepWallets[0], drop_off_rate: 0 },
    {
      step: 2,
      label: '2+ Transactions',
      wallet_count: stepWallets[1],
      drop_off_rate: stepWallets[0] > 0 ? Math.round(((stepWallets[0] - stepWallets[1]) / stepWallets[0]) * 100) : 0,
    },
    {
      step: 3,
      label: '3+ Transactions',
      wallet_count: stepWallets[2],
      drop_off_rate: stepWallets[1] > 0 ? Math.round(((stepWallets[1] - stepWallets[2]) / stepWallets[1]) * 100) : 0,
    },
    {
      step: 4,
      label: '5+ Transactions',
      wallet_count: stepWallets[3],
      drop_off_rate: stepWallets[2] > 0 ? Math.round(((stepWallets[2] - stepWallets[3]) / stepWallets[2]) * 100) : 0,
    },
  ]
}

function AnimatedNumber({ value }: { value: string | number }) {
  const [d, setD] = useState(0)
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''))
  useEffect(() => {
    if (isNaN(num)) return
    let c = 0
    const inc = num / 30
    const t = setInterval(() => {
      c += inc
      if (c >= num) { setD(num); clearInterval(t) } else setD(c)
    }, 33)
    return () => clearInterval(t)
  }, [num])
  if (isNaN(num)) return <span>{value}</span>
  return <span>{d >= 1000 ? d.toLocaleString(undefined, { maximumFractionDigits: 0 }) : d.toFixed(0)}</span>
}

/* ── Compute health score from metrics ── */
function computeHealth(summary: MetricSummary, funnel: ChartDatum[]): number {
  let score = 100
  const d7 = Number(summary.d7RetentionRate ?? summary.d7_retention_rate ?? 0)
  const d30 = Number(summary.d30RetentionRate ?? summary.d30_retention_rate ?? 0)
  const totalW = Number(summary.totalWallets ?? summary.total_wallets ?? 0)
  const avgDaw = Number(summary.avgDailyActiveWallets ?? summary.avg_daily_active_wallets ?? 0)
  const bigDrop = funnel.slice(1).some((s) => Number(s.dropOffRate ?? s.drop_off_rate ?? 0) > 70)
  if (d7 < 20) score -= 35; else if (d7 < 35) score -= 20
  if (d30 < 10) score -= 25; else if (d30 < 20) score -= 12
  if (bigDrop) score -= 20
  if (totalW > 0 && avgDaw / totalW < 0.05) score -= 15
  return Math.max(0, Math.min(100, Math.round(score)))
}

/* ── Generate signals from metrics ── */
function buildSignals(summary: MetricSummary, funnel: ChartDatum[], d7: number, d30: number) {
  const sigs: Array<{ id: string; level: 'critical' | 'warning' | 'info'; title: string; detail: string }> = []
  if (d7 < 15) sigs.push({ id: 's1', level: 'critical', title: '7-Day Retention Critical', detail: `${d7}% D7 — less than 1 in 7 wallets return. Investigate first-session UX.` })
  else if (d7 < 30) sigs.push({ id: 's1', level: 'warning', title: 'Low D7 Retention', detail: `${d7}% D7 — below 30% threshold. Users leaving after first interaction.` })
  if (d30 < 10) sigs.push({ id: 's2', level: 'critical', title: 'D30 Retention Collapsing', detail: `${d30}% monthly — long-term stickiness near zero. Core loop likely broken.` })
  const worstStep = funnel.slice(1).reduce((w: ChartDatum | null, s) => {
    const rate = Number(s.dropOffRate ?? s.drop_off_rate ?? 0)
    return rate > Number(w?.dropOffRate ?? w?.drop_off_rate ?? 0) ? s : w
  }, null)
  if (worstStep) {
    const rate = Number(worstStep.dropOffRate ?? worstStep.drop_off_rate ?? 0)
    if (rate > 60) sigs.push({ id: 's3', level: rate > 75 ? 'critical' : 'warning', title: `Funnel Rupture at Step ${worstStep.step}`, detail: `${rate}% drop-off at "${worstStep.label}" — single biggest conversion loss.` })
  }
  const totalW = Number(summary.totalWallets ?? summary.total_wallets ?? 0)
  const oneAndDone = Math.round(totalW * (1 - d7 / 100) * 0.72)
  if (oneAndDone > 100) sigs.push({ id: 's4', level: 'warning', title: 'High One-and-Done Rate', detail: `~${oneAndDone.toLocaleString()} wallets never returned. Fixing re-engagement alone could double DAW.` })
  const vol = Number(summary.totalVolumeSol ?? summary.total_volume_sol ?? 0)
  if (vol > 0) sigs.push({ id: 's5', level: 'info', title: 'Volume vs DAW Divergence Possible', detail: 'Compare SOL volume trend against DAW. Volume up + DAW down = whale concentration risk.' })
  return sigs
}

export default function DashboardPage() {
  const params = useParams()
  const router = useRouter()
  const programId = params.programId as string
  const { metricsByProgram, setMetrics, isSyncing, setSyncing, user, activeProgram } = usePulseStore()
  const metrics = programId ? metricsByProgram[programId] : null
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [range, setRange] = useState<TimeRange>('30D')
  const [transactions, setTransactions] = useState<TxnRecord[]>([])

  const fetchMetrics = useCallback(async () => {
    if (!user.token || !programId) return
    try {
      const res = await fetch(`${API_BASE}/analytics/metrics/${programId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) setMetrics(programId, await res.json())
      else if (res.status === 404) setMetrics(programId, null)
    } catch { setError('Failed to load metrics.') }
  }, [programId, setMetrics, user.token])

  useEffect(() => {
    if (!metrics && !isSyncing && programId && user.token) {
      const t = window.setTimeout(() => { void fetchMetrics() }, 0)
      return () => window.clearTimeout(t)
    }
  }, [fetchMetrics, isSyncing, metrics, programId, user.token])

  const fetchTransactions = useCallback(async () => {
    if (!user.token || !programId) return
    try {
      const res = await fetch(`${API_BASE}/analytics/transactions/${programId}?limit=1000&offset=0`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setTransactions(data as TxnRecord[])
      }
    } catch (txnErr) {
      console.warn('Could not load transactions for range funnel:', txnErr)
    }
  }, [programId, user.token])

  useEffect(() => {
    if (metrics && user.token && programId) {
      const t = window.setTimeout(() => { void fetchTransactions() }, 0)
      return () => window.clearTimeout(t)
    }
  }, [fetchTransactions, metrics, programId, user.token])

  async function handleSync(force = false) {
    if (!user.token || !programId) return
    setSyncing(true); setError(null)
    try {
      const p = new URLSearchParams()
      if (force) p.set('force', 'true')
      if (activeProgram?.name) p.set('program_name', activeProgram.name)
      const qs = p.toString() ? `?${p.toString()}` : ''
      const res = await fetch(`${API_BASE}/analytics/sync/${programId}${qs}`, {
        method: 'POST', headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMetrics(programId, data.metrics)
        setLastSynced(new Date().toLocaleTimeString())
      } else {
        const e = await res.json()
        setError(e.detail || 'Sync failed')
      }
    } catch { setError('Sync failed.') } finally { setSyncing(false) }
  }

  function copyAddress() {
    navigator.clipboard.writeText(programId)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const dm = metrics as DashboardMetrics | null
  const summary = dm?.summary || {}
  const rawDaw = dm?.dawTrend || dm?.daw_trend || []
  const rawFunnel = dm?.funnel || []
  const rawCohorts = dm?.retentionCohorts || dm?.retention_cohorts || []
  const rawHeatmap = dm?.activityHeatmap || dm?.activity_heatmap || []
  const rawWhales = dm?.whales || []
  const rawDropOff = dm?.dropOffBreakdown || dm?.drop_off_breakdown || []

  const dawTrend = rawDaw.map((r) => ({
    date: String(r.date || ''),
    daw: Number(r.daw || 0),
    new_wallets: Number(r.newWallets ?? r.new_wallets ?? 0),
    returning_wallets: Number(r.returningWallets ?? r.returning_wallets ?? 0),
  }))
  const funnel = rawFunnel.map((r) => ({
    step: Number(r.step || 0), label: String(r.label || ''),
    wallet_count: Number(r.walletCount ?? r.wallet_count ?? 0),
    drop_off_rate: Number(r.dropOffRate ?? r.drop_off_rate ?? 0),
  }))
  const cohorts = rawCohorts.map((r) => ({
    cohort_week: String(r.cohortWeek ?? r.cohort_week ?? ''),
    week_number: Number(r.weekNumber ?? r.week_number ?? 0),
    wallet_count: Number(r.walletCount ?? r.wallet_count ?? 0),
    retention_rate: Number(r.retentionRate ?? r.retention_rate ?? 0),
  }))
  const activityHeatmap = rawHeatmap.map((r) => ({
    hour: Number(r.hour ?? 0),
    day: Number(r.day ?? 0),
    count: Number(r.count ?? 0),
  }))
  const whales = rawWhales.map((w) => ({
    address: String(w.address ?? ''),
    txns: Number(w.txns ?? 0),
    volume_sol: Number(w.volumeSol ?? w.volume_sol ?? 0),
    share_pct: Number(w.sharePct ?? w.share_pct ?? 0),
  }))
  const dropOffBreakdown = rawDropOff.map((d) => ({
    label: String(d.label ?? ''),
    value: Number(d.value ?? 0),
  }))

  const totalWallets = Number(summary.totalWallets ?? summary.total_wallets ?? 0)
  const totalTxns = Number(summary.totalTransactions ?? summary.total_transactions ?? 0)
  const avgDaw = Number(summary.avgDailyActiveWallets ?? summary.avg_daily_active_wallets ?? 0)
  const d7 = Number(summary.d7RetentionRate ?? summary.d7_retention_rate ?? 0)
  const d30 = Number(summary.d30RetentionRate ?? summary.d30_retention_rate ?? 0)
  const volSol = Number(summary.totalVolumeSol ?? summary.total_volume_sol ?? 0)
  const avgTxnsPerWallet = totalWallets > 0 ? (totalTxns / totalWallets).toFixed(1) : '—'

  const healthScore = metrics ? computeHealth(summary, rawFunnel) : 0
  const signals = metrics ? buildSignals(summary, rawFunnel, d7, d30) : []
  const filteredDawTrend = filterDawByRange(dawTrend, range)
  const rangeAvgDaw = filteredDawTrend.length > 0
    ? Math.round(filteredDawTrend.reduce((sum, d) => sum + d.daw, 0) / filteredDawTrend.length)
    : avgDaw
  const rangeFunnel = transactions.length > 0 ? buildRangeFunnel(transactions, range) : funnel
  const rangeLabel = range

  const shortAddr = programId.length > 12 ? `${programId.slice(0, 6)}…${programId.slice(-4)}` : programId
  const statusColor = !metrics ? '#999' : healthScore >= 65 ? '#16a34a' : healthScore >= 35 ? '#d97706' : '#dc2626'
  const statusLabel = !metrics ? 'No Data' : healthScore >= 65 ? 'Healthy' : healthScore >= 35 ? 'At Risk' : 'Critical'

  return (
    <div className="min-h-screen relative overflow-hidden">

      {/* ── Top Rail ── */}
      <header className="fixed top-0 left-0 right-0 z-50 machined-panel px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 f1-m text-[10px] uppercase tracking-widest text-black/60 hover:text-black transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Programs
          </button>
          <div className="w-px h-6 bg-black/20" />

          {/* Program ID + status badges */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm f1-h font-bold text-black/80 uppercase">{activeProgram?.name || 'Analytics'}</h1>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] f1-m font-bold uppercase"
                  style={{ borderColor: statusColor + '50', color: statusColor, background: statusColor + '14' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                  {statusLabel}
                </span>
                {metrics && (
                  <span className="text-[9px] f1-m text-black/40 uppercase border border-black/15 px-1.5 py-0.5 rounded-full">
                    Score {healthScore}/100
                  </span>
                )}
              </div>
              <button onClick={copyAddress} className="text-[10px] f1-m flex items-center gap-1.5 text-black/50 hover:text-black transition-colors mt-0.5 uppercase tracking-widest">
                {shortAddr}
                {copied ? <span className="text-green-600">✓</span> : (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center rounded-sm border border-black/20 overflow-hidden bg-white/40">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setRange(opt)}
                className={`px-2.5 py-1 text-[9px] f1-m uppercase tracking-widest border-r border-black/15 last:border-r-0 transition-colors ${
                  range === opt ? 'bg-black text-white' : 'text-black/60 hover:text-black'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {lastSynced && (
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] f1-m uppercase tracking-widest text-black/50">
              <span className="status-dot on" />Sync {lastSynced}
            </span>
          )}
          <button onClick={() => handleSync(true)} disabled={isSyncing} className="btn text-[10px] uppercase tracking-widest flex items-center gap-2">
            {isSyncing ? (
              <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
              </svg><span className="btn-label">Syncing</span></>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg><span className="btn-label">Re-sync</span></>
            )}
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-20 space-y-5">

        {/* Error */}
        {error && (
          <div className="plate p-3 flex items-center justify-between border-l-4 border-red-500">
            <span className="text-red-700 f1-m text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
              <span className="status-dot error" />{error}
            </span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* No data state */}
        {!metrics && !isSyncing && (
          <div className="plate p-12 text-center">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-black/10 border border-black/20">
              <svg className="w-7 h-7 stroke-black/50" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <p className="text-base f1-h font-bold uppercase text-black/80 mb-2">Awaiting Data</p>
            <p className="text-xs f1-m text-black/50 mb-6 uppercase tracking-widest">Initiate sync to compile program metrics.</p>
            <button onClick={() => handleSync(false)} className="btn-hero text-xs uppercase tracking-widest">
              <span className="btn-label">Compile Data</span>
            </button>
          </div>
        )}

        {metrics && (
          <>
            {/* ── Stat Row ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="animate-scale-in">
                <MetricCard label="Total Wallets" value={<AnimatedNumber value={totalWallets} />} subtext={`${totalTxns.toLocaleString()} TXNs`} />
              </div>
              <div className="animate-scale-in stagger-1">
                <MetricCard label={`Avg DAW / ${rangeLabel}`} value={<AnimatedNumber value={rangeAvgDaw} />} subtext="Daily active wallets" trend={rangeAvgDaw > 50 ? 'up' : 'down'} />
              </div>
              <div className="animate-scale-in stagger-2">
                <MetricCard label="Est. SOL Volume" value={volSol > 0 ? `${volSol.toFixed(0)} ◎` : '—'} subtext={volSol > 0 ? 'On-chain total' : 'No volume data'} trend={volSol > 0 ? 'neutral' : undefined} />
              </div>
              <div className="animate-scale-in stagger-3">
                <MetricCard label="Avg TXNs / Wallet" value={avgTxnsPerWallet} subtext={Number(avgTxnsPerWallet) > 3 ? 'Engaged' : 'Low engagement'} trend={Number(avgTxnsPerWallet) > 3 ? 'up' : 'down'} />
              </div>
              <div className="animate-scale-in stagger-4">
                <HealthScore score={healthScore} />
              </div>
            </div>

            {/* ── Acquisition & Activity ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
              <div className="animate-scale-in stagger-1"><DAWChart data={filteredDawTrend} rangeLabel={rangeLabel} /></div>
              <div className="animate-scale-in stagger-2">
                <WalletSegments totalWallets={totalWallets} d7Retention={d7} d30Retention={d30} />
              </div>
            </div>

            {/* ── Funnel & Conversion ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
              <div className="animate-scale-in stagger-1"><FunnelChart data={rangeFunnel} rangeLabel={rangeLabel} /></div>
              <div className="animate-scale-in stagger-2"><DropOffBreakdown data={dropOffBreakdown} /></div>
            </div>

            {/* ── Retention & Heatmap ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
              <div className="animate-scale-in stagger-1"><RetentionGrid data={cohorts} /></div>
              <div className="animate-scale-in stagger-2"><ActivityHeatmap data={activityHeatmap} /></div>
            </div>

            {/* ── Whales & Health Score/Signals ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
              <div className="animate-scale-in stagger-1"><WhaleTable wallets={whales} /></div>
              <div className="animate-scale-in stagger-2">
                {/* The health score visual in the reference is integrated near Whales. We have a SignalFeed here that's important for the AI flow. */}
                <SignalFeed
                  signals={signals}
                  onAskAI={() => {
                    if (canAccess(user.plan, 'ai_insights')) {
                      router.push(`/dashboard/${programId}/insights`)
                    } else {
                      router.push('/account')
                    }
                  }}
                />
              </div>
            </div>



            {/* ── AI CTA ── */}
            <div className="animate-scale-in stagger-4">
              <div className="plate relative overflow-hidden bg-black text-white p-8 md:p-10">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/20 blur-3xl rounded-full" />
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="max-w-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
                      <span className="text-[10px] f1-m text-cyan-400 uppercase tracking-widest font-bold">AI Diagnostics Online</span>
                    </div>
                    <h2 className="text-2xl f1-h font-bold text-white uppercase tracking-tight mb-2">Locate Structural Defects</h2>
                    <p className="text-gray-400 text-[10px] f1-m uppercase tracking-widest leading-relaxed">
                      LangGraph identifies the root cause of every signal above. Not just what is wrong — exactly what to change.
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    {canAccess(user.plan, 'ai_insights') ? (
                      <button onClick={() => router.push(`/dashboard/${programId}/insights?auto=1`)} className="btn-hero">
                        <span className="btn-label">Execute AI Insights</span>
                      </button>
                    ) : (
                      <>
                        <button onClick={() => router.push('/account')} className="btn-hero">
                          <span className="btn-label">Unlock AI Diagnostics</span>
                        </button>
                        <span className="text-[9px] text-gray-500 uppercase tracking-widest f1-m">Team & Protocol · from $99/mo</span>
                      </>
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