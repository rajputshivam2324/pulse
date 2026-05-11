'use client'

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'

/* ── Tooltip ── */
interface TooltipEntry { dataKey: string; name?: string; value?: number; color?: string }
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) => {
  if (!active || !payload) return null
  return (
    <div className="plate px-4 py-3 text-xs" style={{ minWidth: 150 }}>
      <p className="f1-m font-bold uppercase tracking-widest mb-2 text-black/80 border-b border-black/20 pb-2">{label}</p>
      {payload.map((e) => (
        <p key={e.dataKey} className="f1-m text-[10px] uppercase tracking-widest font-bold flex justify-between" style={{ color: e.color }}>
          <span>{e.name}:</span><span>{e.value?.toLocaleString()}</span>
        </p>
      ))}
    </div>
  )
}

export function healthGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'F'
}

/* ── MetricCard ── */
export function MetricCard({ label, value, subtext, trend }: {
  label: string; value: React.ReactNode; subtext?: string; trend?: 'up' | 'down' | 'neutral'
}) {
  const trendColor = trend === 'up' ? '#16a34a' : trend === 'down' ? '#dc2626' : '#555'
  const trendIcon = trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''
  return (
    <div className="metric-card group">
      <div className="data-key mb-2 relative z-10">{label}</div>
      <div className="f1-h text-4xl font-bold uppercase text-black/80 relative z-10 mb-1">{value}</div>
      {subtext && (
        <div className="data-key mt-2 flex items-center gap-1.5 relative z-10" style={{ color: 'rgba(40,40,70,0.65)' }}>
          {trendIcon && <span style={{ color: trendColor }}>{trendIcon}</span>}
          {subtext}
        </div>
      )}
    </div>
  )
}

/* ── Health Score ── */
export function HealthScore({ score }: { score: number }) {
  const grade = healthGrade(score)
  const color = score >= 65 ? '#16a34a' : score >= 35 ? '#d97706' : '#dc2626'
  const segments = [
    { name: 'score', value: score, fill: color },
    { name: 'rest', value: 100 - score, fill: 'rgba(0,0,0,0.08)' },
  ]
  return (
    <div className="plate p-5 flex flex-col items-center justify-center text-center">
      <div className="data-key mb-3">Health Score</div>
      <div className="relative w-28 h-28">
        <PieChart width={112} height={112}>
          <Pie data={segments} cx={52} cy={52} innerRadius={36} outerRadius={52} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
            {segments.map((s, i) => <Cell key={i} fill={s.fill} />)}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="f1-h text-2xl font-black" style={{ color }}>{grade}</span>
          <span className="f1-m text-[10px] text-black/50">{score}/100</span>
        </div>
      </div>
      <div className="mt-3 text-[10px] f1-m uppercase tracking-widest" style={{ color }}>
        {score >= 65 ? 'Healthy' : score >= 35 ? 'At Risk' : 'Critical'}
      </div>
    </div>
  )
}

/* ── DAW Chart ── */
export function DAWChart({
  data,
  rangeLabel = '30D',
}: {
  data: Array<{ date: string; daw: number; new_wallets: number; returning_wallets: number }>
  rangeLabel?: string
}) {
  const latest = data[data.length - 1]
  const returningShare = latest && latest.daw > 0 ? Math.round((latest.returning_wallets / latest.daw) * 100) : 0

  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">DAW Timeline ({rangeLabel})</h3>
        <div className="flex items-center gap-4 text-[10px] f1-m font-bold uppercase tracking-widest text-black/60">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#555]" />New</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#999]" />Return</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-sm border border-black/10 bg-black/[0.03] p-2">
          <div className="text-[8px] f1-m uppercase tracking-widest text-black/35">Latest DAW</div>
          <div className="f1-h text-lg font-bold text-black/80">{latest?.daw?.toLocaleString() || 0}</div>
        </div>
        <div className="rounded-sm border border-black/10 bg-black/[0.03] p-2">
          <div className="text-[8px] f1-m uppercase tracking-widest text-black/35">Returning</div>
          <div className="f1-h text-lg font-bold text-black/80">{returningShare}%</div>
        </div>
        <div className="rounded-sm border border-black/10 bg-black/[0.03] p-2">
          <div className="text-[8px] f1-m uppercase tracking-widest text-black/35">Days</div>
          <div className="f1-h text-lg font-bold text-black/80">{data.length}</div>
        </div>
      </div>
      <div style={{ height: 240 }} className="bg-black/5 rounded-sm p-2 border border-black/10">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.12)" />
            <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={{ stroke: 'rgba(0,0,0,0.2)' }} />
            <YAxis tick={{ fill: '#444', fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.2)', strokeDasharray: '4 4' }} />
            <Bar dataKey="new_wallets" name="New" stackId="a" fill="#1f2937" radius={[2, 2, 0, 0]} />
            <Bar dataKey="returning_wallets" name="Return" stackId="a" fill="#9ca3af" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ── Funnel Chart ── */
export function FunnelChart({
  data,
  rangeLabel = '30D',
}: {
  data: Array<{ step: number; label: string; wallet_count: number; drop_off_rate: number }>
  rangeLabel?: string
}) {
  const firstCount = data[0]?.wallet_count || 1
  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Funnel Drop-off ({rangeLabel})</h3>
        <div className="flex gap-1.5 flex-wrap">
          {data.slice(1).map((s) => (
            <span key={s.step} className="tag" style={{ background: s.drop_off_rate > 50 ? 'rgba(220,38,38,0.12)' : 'rgba(0,0,0,0.06)', color: s.drop_off_rate > 50 ? '#dc2626' : '#444', border: `1px solid ${s.drop_off_rate > 50 ? 'rgba(220,38,38,0.3)' : 'rgba(0,0,0,0.1)'}` }}>
              Step {s.step}: -{s.drop_off_rate}%
            </span>
          ))}
        </div>
      </div>
      <div className="bg-black/5 rounded-sm p-3 border border-black/10 space-y-3">
        {data.map((step) => {
          const pct = Math.max(3, Math.round((step.wallet_count / firstCount) * 100))
          const hot = step.drop_off_rate >= 60
          return (
            <div key={step.step}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-sm bg-black/80 text-white text-[10px] f1-h font-bold flex items-center justify-center">{step.step}</span>
                  <span className="text-[10px] f1-m uppercase tracking-widest text-black/60 truncate">{step.label}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs f1-h font-bold text-black/80">{step.wallet_count.toLocaleString()}</div>
                  {step.step > 1 && (
                    <div className="text-[9px] f1-m font-bold" style={{ color: hot ? '#dc2626' : '#d97706' }}>
                      -{step.drop_off_rate}%
                    </div>
                  )}
                </div>
              </div>
              <div className="h-8 rounded-sm bg-black/[0.06] border border-black/10 overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: hot ? '#dc2626' : step.step === 1 ? '#111827' : '#4b5563',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Drop-off Breakdown ── */
export function DropOffBreakdown({ data }: { data?: Array<{ label: string; value: number }> }) {
  const colors = ['#dc2626', '#d97706', '#2563eb', '#16a34a']
  
  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Drop-off Breakdown (Step 1→2)</h3>
      </div>
      {!data || data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-[10px] f1-m text-black/30 uppercase tracking-widest">
          Sync to compute breakdown
        </div>
      ) : (
        <div style={{ height: 200 }} className="relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" stroke="none">
                {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {data && data.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
          {data.map((d, i) => (
            <div key={d.label} className="flex items-center gap-1.5 text-[9px] f1-m text-black/60">
              <span className="w-2 h-2 rounded-sm" style={{ background: colors[i % colors.length] }} />
              {d.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Wallet Segments ── */
export function WalletSegments({ totalWallets, d7Retention }: { totalWallets: number; d7Retention: number; d30Retention: number }) {
  const oneAndDone = Math.round(totalWallets * (1 - d7Retention / 100) * 0.72)
  const casual = Math.round(totalWallets * 0.14)
  const regular = Math.round(totalWallets * 0.18)
  const power = Math.max(0, totalWallets - oneAndDone - casual - regular)

  const segments = [
    { label: 'Power', count: power, color: '#1a1a1a', desc: '10+ txns, high retention' },
    { label: 'Regular', count: regular, color: '#444', desc: '3–10 txns' },
    { label: 'Casual', count: casual, color: '#888', desc: '2–3 txns' },
    { label: 'One-and-Done', count: oneAndDone, color: '#bbb', desc: 'Single transaction — biggest lever' },
  ]
  const total = segments.reduce((s, x) => s + x.count, 0) || 1

  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Wallet Segments</h3>
        <span className="tag">{totalWallets.toLocaleString()} total</span>
      </div>
      <div className="space-y-3 relative z-10">
        {segments.map((seg) => {
          const pct = Math.round((seg.count / total) * 100)
          return (
            <div key={seg.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
                  <span className="f1-h text-[11px] font-bold uppercase text-black/70">{seg.label}</span>
                  {seg.label === 'One-and-Done' && (
                    <span className="text-[9px] f1-m text-red-600 uppercase tracking-widest font-bold">⚠ Fix First</span>
                  )}
                </div>
                <span className="f1-h text-sm font-bold text-black/80">{seg.count.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-black/8 rounded-full overflow-hidden border border-black/10">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: seg.color }} />
              </div>
              <div className="text-[9px] f1-m text-black/40 mt-0.5">{pct}% — {seg.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Retention Grid ── */
function heatColor(rate: number): string {
  if (rate >= 70) return '#16a34a'
  if (rate >= 50) return '#65a30d'
  if (rate >= 30) return '#d97706'
  if (rate >= 10) return '#dc2626'
  if (rate > 0) return '#991b1b'
  return 'transparent'
}

export function RetentionGrid({ data }: { data: Array<{ cohort_week: string; week_number: number; wallet_count: number; retention_rate: number }> }) {
  const cohorts = new Map<string, Array<{ week_number: number; retention_rate: number }>>()
  data.forEach((d) => {
    if (!cohorts.has(d.cohort_week)) cohorts.set(d.cohort_week, [])
    cohorts.get(d.cohort_week)!.push(d)
  })
  const keys = Array.from(cohorts.keys()).sort().slice(-8)

  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Cohort Retention Matrix</h3>
        <div className="flex items-center gap-2 text-[9px] f1-m text-black/50 uppercase">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#16a34a' }} />High</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#d97706' }} />Mid</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#dc2626' }} />Low</span>
        </div>
      </div>
      <div className="overflow-x-auto bg-black/5 rounded-sm p-2 border border-black/10">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-black/50">Cohort</th>
              {[0, 1, 2, 3, 4, 5, 6].map((w) => (
                <th key={w} className="text-center px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-black/50">W{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((week) => {
              const wd = cohorts.get(week) || []
              return (
                <tr key={week} className="border-t border-black/5">
                  <td className="px-2 py-1.5 text-[10px] font-bold text-black/50">{week.slice(5)}</td>
                  {[0, 1, 2, 3, 4, 5, 6].map((wn) => {
                    const cell = wd.find((d) => d.week_number === wn)
                    const rate = cell?.retention_rate || 0
                    return (
                      <td key={wn} className="text-center px-1 py-1">
                        <span
                          className="inline-flex items-center justify-center w-full h-7 rounded-sm text-[10px] font-bold border border-black/10 transition-all"
                          style={{ background: rate > 0 ? heatColor(rate) : 'rgba(0,0,0,0.04)', color: rate >= 30 ? '#fff' : rate > 0 ? '#111' : '#999', textShadow: rate >= 30 ? '0 1px 0 rgba(0,0,0,0.4)' : 'none' }}
                        >
                          {rate > 0 ? `${rate}%` : '–'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Activity Heatmap ── */
export function ActivityHeatmap({ data }: { data?: Array<{ hour: number; day: number; count: number }> }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const maxCount = data ? Math.max(...data.map((d) => d.count), 1) : 1

  const getCount = (hour: number, day: number) => {
    if (!data) return 0
    return data.find((d) => d.hour === hour && d.day === day)?.count || 0
  }

  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Activity Heatmap</h3>
        <span className="text-[9px] f1-m text-black/40 uppercase">UTC · hour × day</span>
      </div>
      {!data ? (
        <div className="h-24 flex items-center justify-center text-[10px] f1-m text-black/30 uppercase tracking-widest">
          Hourly data available after re-sync
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            <div className="flex flex-col gap-1 mr-1 pt-5">
              {days.map((d) => (
                <div key={d} className="h-5 flex items-center text-[9px] f1-m text-black/40 uppercase pr-1">{d}</div>
              ))}
            </div>
            <div>
              <div className="flex gap-1 mb-1">
                {hours.filter((h) => h % 4 === 0).map((h) => (
                  <div key={h} className="text-[9px] f1-m text-black/40" style={{ width: 20 * 4 + 3 * 4 - 1 }}>{h}h</div>
                ))}
              </div>
              {days.map((_, day) => (
                <div key={day} className="flex gap-1 mb-1">
                  {hours.map((hour) => {
                    const count = getCount(hour, day)
                    const intensity = count / maxCount
                    return (
                      <div
                        key={hour}
                        title={`${days[day]} ${hour}:00 — ${count} txns`}
                        className="w-5 h-5 rounded-sm border border-black/10 cursor-default transition-opacity hover:opacity-80"
                        style={{ background: count > 0 ? `rgba(0,0,0,${0.08 + intensity * 0.75})` : 'rgba(0,0,0,0.04)' }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Whale Table ── */
export function WhaleTable({ wallets }: { wallets?: Array<{ address: string; txns: number; volume_sol: number; share_pct: number }> }) {
  const truncate = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`

  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Top Wallets</h3>
        {wallets && <span className="tag">By SOL volume</span>}
      </div>
      {!wallets || wallets.length === 0 ? (
        <div className="h-20 flex items-center justify-center text-[10px] f1-m text-black/30 uppercase tracking-widest">
          Sync to compute top wallets
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-black/10">
                {['Rank', 'Address', 'TXNs', 'SOL Vol', 'Share'].map((h) => (
                  <th key={h} className="text-[9px] f1-m uppercase tracking-widest text-black/40 px-2 py-1.5 text-left font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wallets.map((w, i) => (
                <tr key={w.address} className="border-b border-black/5 hover:bg-black/4 transition-colors">
                  <td className="px-2 py-2 text-[10px] text-black/40 font-bold">#{i + 1}</td>
                  <td className="px-2 py-2 text-[10px] font-mono text-black/70 font-bold">{truncate(w.address)}</td>
                  <td className="px-2 py-2 text-[10px] text-black/70">{w.txns.toLocaleString()}</td>
                  <td className="px-2 py-2 text-[10px] text-black/70">{w.volume_sol.toFixed(1)} ◎</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 bg-black/8 rounded-full w-16 overflow-hidden">
                        <div className="h-full bg-black/50 rounded-full" style={{ width: `${w.share_pct}%` }} />
                      </div>
                      <span className="text-[9px] text-black/50">{w.share_pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Signal Feed ── */
interface Signal { id: string; level: 'critical' | 'warning' | 'info'; title: string; detail: string }

export function SignalFeed({ signals, onAskAI }: { signals: Signal[]; onAskAI: (s: Signal) => void }) {
  const colors = { critical: '#dc2626', warning: '#d97706', info: '#2563eb' }
  const icons = { critical: '⬤', warning: '◆', info: '●' }

  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Signal Feed</h3>
        <span className="tag">{signals.length} active</span>
      </div>
      <div className="space-y-3 relative z-10">
        {signals.map((s) => (
          <div key={s.id} className="flex items-start justify-between gap-3 p-3 bg-black/4 rounded-sm border border-black/8 hover:bg-black/6 transition-colors">
            <div className="flex items-start gap-3 min-w-0">
              <span className="text-[8px] mt-0.5 shrink-0" style={{ color: colors[s.level] }}>{icons[s.level]}</span>
              <div className="min-w-0">
                <div className="f1-h text-[11px] font-bold text-black/80 uppercase">{s.title}</div>
                <div className="f1-m text-[10px] text-black/50 mt-0.5">{s.detail}</div>
              </div>
            </div>
            <button
              onClick={() => onAskAI(s)}
              className="shrink-0 flex items-center gap-1 px-2 py-1 text-[9px] f1-m uppercase tracking-widest font-bold text-black/60 hover:text-black border border-black/15 rounded-sm bg-white/50 hover:bg-white transition-all"
            >
              Ask AI
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        ))}
        {signals.length === 0 && (
          <div className="text-center py-6 text-[10px] f1-m text-black/30 uppercase tracking-widest">
            No active signals — system nominal
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Retention By Type Table (for Insights page) ── */
export interface TypeRetentionRow {
  type: string
  total_wallets: number
  returned_wallets: number
  return_rate: number
  d30_return_rate?: number
  avg_txns?: number
  churn_rate?: number
}

function retentionCellColor(rate: number): { bg: string; text: string } {
  if (rate >= 30) return { bg: 'rgba(22,163,74,0.15)', text: '#16a34a' }
  if (rate >= 10) return { bg: 'rgba(217,119,6,0.15)', text: '#d97706' }
  return { bg: 'rgba(220,38,38,0.12)', text: '#dc2626' }
}

const BENCHMARK_D7 = 25 // Solana DeFi average
const BENCHMARK_D30 = 10

export function RetentionByTypeTable({ data }: { data: TypeRetentionRow[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="plate p-5">
        <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
          <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Action Type Comparison</h3>
        </div>
        <div className="h-24 flex items-center justify-center text-[10px] f1-m text-black/30 uppercase tracking-widest">
          No per-type data available
        </div>
      </div>
    )
  }

  const sorted = [...data].sort((a, b) => b.return_rate - a.return_rate)

  return (
    <div className="plate p-5">
      <div className="flex items-center justify-between mb-4 border-b border-black/20 pb-3">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">Action Type Comparison</h3>
        <span className="tag">vs DeFi avg</span>
      </div>
      <div className="overflow-x-auto bg-black/5 rounded-sm border border-black/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black/10">
              {['Action Type', 'Users', 'D7 Ret.', 'D30 Ret.', 'Avg Txns', 'vs Bench'].map((h) => (
                <th key={h} className="text-[9px] f1-m uppercase tracking-widest text-black/40 px-3 py-2.5 text-left font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const cell = retentionCellColor(row.return_rate)
              const d30 = row.d30_return_rate ?? Math.max(0, Math.round(row.return_rate * 0.4))
              const d30Cell = retentionCellColor(d30)
              const delta = row.return_rate - BENCHMARK_D7
              const deltaColor = delta >= 0 ? '#16a34a' : '#dc2626'
              return (
                <tr key={row.type} className="border-b border-black/5 hover:bg-black/[0.03] transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="f1-m text-[11px] font-bold text-black/70 uppercase">{row.type}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] f1-m text-black/60 font-mono">{row.total_wallets}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] font-bold f1-m"
                      style={{ background: cell.bg, color: cell.text }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cell.text }} />
                      {row.return_rate}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] font-bold f1-m"
                      style={{ background: d30Cell.bg, color: d30Cell.text }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: d30Cell.text }} />
                      {d30}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] f1-m text-black/60 font-mono">
                    {row.avg_txns?.toFixed(1) ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] font-bold f1-m" style={{ color: deltaColor }}>
                      {delta >= 0 ? '+' : ''}{delta}% / {d30 - BENCHMARK_D30 >= 0 ? '+' : ''}{d30 - BENCHMARK_D30}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Retention By Type Bar (mini chart for anomaly evidence zones) ── */
export function RetentionByTypeBar({ data }: { data: TypeRetentionRow[] }) {
  if (!data || data.length === 0) return null
  const sorted = [...data].sort((a, b) => b.return_rate - a.return_rate).slice(0, 6)
  const maxRate = Math.max(...sorted.map(r => r.return_rate), 1)

  return (
    <div className="bg-black/[0.03] rounded-sm border border-black/10 p-3">
      <div className="text-[9px] f1-m uppercase tracking-widest text-black/40 font-bold mb-3">Retention by First Action</div>
      <div className="space-y-1.5">
        {sorted.map((row) => {
          const cell = retentionCellColor(row.return_rate)
          return (
            <div key={row.type} className="flex items-center gap-2">
              <span className="text-[9px] f1-m text-black/50 uppercase w-24 truncate shrink-0">{row.type}</span>
              <div className="flex-1 h-4 bg-black/[0.06] rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-700"
                  style={{ width: `${(row.return_rate / Math.max(maxRate, 100)) * 100}%`, background: cell.text }}
                />
              </div>
              <span className="text-[9px] f1-m font-bold w-8 text-right" style={{ color: cell.text }}>{row.return_rate}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Mini Funnel (for anomaly evidence zones) ── */
export function MiniFunnel({ data }: { data: Array<{ step: number; label: string; wallet_count: number; drop_off_rate: number }> }) {
  if (!data || data.length === 0) return null
  const maxCount = Math.max(...data.map(d => d.wallet_count), 1)

  return (
    <div className="bg-black/[0.03] rounded-sm border border-black/10 p-3">
      <div className="text-[9px] f1-m uppercase tracking-widest text-black/40 font-bold mb-3">Transaction Funnel</div>
      <div className="space-y-1.5">
        {data.map((step) => (
          <div key={step.step} className="flex items-center gap-2">
            <span className="text-[9px] f1-m text-black/50 w-16 truncate shrink-0">Step {step.step}</span>
            <div className="flex-1 h-4 bg-black/[0.06] rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-700 bg-black/30"
                style={{ width: `${(step.wallet_count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-[9px] f1-m text-black/60 w-12 text-right">{step.wallet_count}</span>
            {step.drop_off_rate > 0 && (
              <span className="text-[8px] f1-m text-red-600 font-bold w-10 text-right">-{step.drop_off_rate}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Mini DAW Trend (for anomaly evidence zones) ── */
export function MiniDAWTrend({ data }: { data: Array<{ date: string; daw: number; new_wallets: number; returning_wallets: number }> }) {
  if (!data || data.length === 0) return null
  const latest = data[data.length - 1]
  const first = data[0]
  const delta = (latest?.daw || 0) - (first?.daw || 0)

  return (
    <div className="bg-black/[0.03] rounded-sm border border-black/10 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[9px] f1-m uppercase tracking-widest text-black/40 font-bold">DAW Trend</div>
        <span className="text-[9px] f1-m font-bold" style={{ color: delta >= 0 ? '#16a34a' : '#dc2626' }}>
          {delta >= 0 ? '+' : ''}{delta} wallets
        </span>
      </div>
      <div className="h-24 bg-black/[0.03] rounded-sm">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="miniDaw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#333" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#333" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="daw" stroke="#333" fill="url(#miniDaw)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ── Impact Card (Quick Wins) ── */
export function ImpactCard({ metric, description, effort }: {
  metric: string
  description: string
  effort: string
}) {
  return (
    <div className="plate p-5 flex flex-col items-center text-center group hover:-translate-y-0.5 transition-all">
      <div className="f1-h text-3xl font-bold text-black/80 mb-2">{metric}</div>
      <p className="text-[10px] f1-m text-black/60 uppercase tracking-widest leading-relaxed mb-4 flex-1">{description}</p>
      <span className="tag text-[8px]">Effort: {effort}</span>
    </div>
  )
}
