'use client'

/**
 * Dashboard Chart Components — Exact Metallic Silver Design System
 */

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

/* ========================================
   Metric Card
   ======================================== */

interface MetricCardProps {
  label: string
  value: string | number | React.ReactNode
  subtext?: string
  trend?: 'up' | 'down' | 'neutral'
}

export function MetricCard({ label, value, subtext, trend }: MetricCardProps) {
  const trendColor = trend === 'up' ? 'rgba(20,120,60,0.8)' : trend === 'down' ? '#8a2be2' : '#555' 
  const trendIcon = trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''

  return (
    <div className="metric-card group" style={{ transformOrigin: 'center top' }}>
      <div className="data-key mb-2 relative z-10">
        {label}
      </div>
      <div className="f1-h text-4xl font-bold uppercase text-black/80 relative z-10 mb-1">
        {value}
      </div>
      {subtext && (
        <div className="data-key mt-2 flex items-center gap-1.5 animate-fade-in relative z-10" style={{ color: 'rgba(40,40,70,0.65)' }}>
          {trendIcon && <span style={{ color: trendColor }}>{trendIcon}</span>}
          {subtext}
        </div>
      )}
    </div>
  )
}

/* ========================================
   DAW Area Chart
   ======================================== */

interface DAWChartProps {
  data: Array<{
    date: string
    daw: number
    new_wallets: number
    returning_wallets: number
  }>
}

interface TooltipEntry {
  dataKey: string
  name?: string
  value?: number
  color?: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload) return null
  return (
    <div className="plate px-4 py-3 text-xs" style={{ minWidth: '150px' }}>
      <p className="f1-m font-bold uppercase tracking-widest mb-2 text-black/80 border-b border-black/20 pb-2 shadow-[0_1px_0_rgba(255,255,255,0.3)]">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <p key={entry.dataKey} className="f1-m text-[10px] uppercase tracking-widest font-bold flex justify-between" style={{ color: entry.color }}>
            <span>{entry.name}:</span>
            <span>{entry.value?.toLocaleString()}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

export function DAWChart({ data }: DAWChartProps) {
  return (
    <div className="plate p-5 animate-scale-in">
      <div className="flex items-center justify-between mb-6 relative z-10 border-b border-black/20 pb-3 shadow-[0_1px_0_rgba(255,255,255,0.3)]">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">
          DAW (30d) Timeline
        </h3>
        <div className="flex items-center gap-4 text-[10px] f1-m font-bold uppercase tracking-widest text-black/60">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-[#555] border border-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"></span>
            New
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-[#999] border border-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"></span>
            Return
          </span>
        </div>
      </div>
      <div style={{ height: 280 }} className="relative z-10 bg-black/5 rounded-sm p-2 border border-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.5)]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#555" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#555" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradReturn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#999" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#999" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.15)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,0,0,0.3)' }}
            />
            <YAxis
              tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.3)', strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Area
              type="step"
              dataKey="new_wallets"
              name="New"
              stackId="1"
              stroke="#333"
              fill="url(#gradNew)"
              strokeWidth={2}
            />
            <Area
              type="step"
              dataKey="returning_wallets"
              name="Return"
              stackId="1"
              stroke="#777"
              fill="url(#gradReturn)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ========================================
   Transaction Funnel
   ======================================== */

interface FunnelChartProps {
  data: Array<{
    step: number
    label: string
    wallet_count: number
    drop_off_rate: number
  }>
}

export function FunnelChart({ data }: FunnelChartProps) {
  const colors = ['#222', '#444', '#666', '#888', '#aaa']

  return (
    <div className="plate p-5 animate-scale-in stagger-1" style={{ animationDelay: '150ms' }}>
      <div className="flex items-center justify-between mb-6 relative z-10 border-b border-black/20 pb-3 shadow-[0_1px_0_rgba(255,255,255,0.3)]">
        <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80">
          Funnel Diagnostics
        </h3>
        <div className="flex gap-2 flex-wrap">
          {data.slice(1).map((step) => (
            <span
              key={step.step}
              className="tag"
              style={{
                background: step.drop_off_rate > 50 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
                color: step.drop_off_rate > 50 ? '#000' : '#444',
                border: `1px solid ${step.drop_off_rate > 50 ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)'}`,
              }}
            >
              Step {step.step}: -{step.drop_off_rate}%
            </span>
          ))}
        </div>
      </div>
      <div style={{ height: 280 }} className="relative z-10 bg-black/5 rounded-sm p-2 border border-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.5)]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.15)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,0,0,0.3)' }}
            />
            <YAxis
              tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="wallet_count" name="Wallets" radius={[2, 2, 0, 0]}>
              {data.map((_, idx) => (
                <Cell key={idx} fill={colors[idx % colors.length]} stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ========================================
   Retention Cohort Grid (Heatmap)
   ======================================== */

interface RetentionGridProps {
  data: Array<{
    cohort_week: string
    week_number: number
    wallet_count: number
    retention_rate: number
  }>
}

function getHeatmapColor(rate: number): string {
  if (rate >= 80) return 'rgba(30, 30, 30, 0.8)'
  if (rate >= 60) return 'rgba(60, 60, 60, 0.7)'
  if (rate >= 40) return 'rgba(90, 90, 90, 0.5)'
  if (rate >= 20) return 'rgba(120, 120, 120, 0.3)'
  if (rate > 0) return 'rgba(150, 150, 150, 0.15)'
  return 'rgba(255,255,255,0.1)'
}

export function RetentionGrid({ data }: RetentionGridProps) {
  const cohorts = new Map<string, Array<{ week_number: number; retention_rate: number; wallet_count: number }>>()
  data.forEach((d) => {
    if (!cohorts.has(d.cohort_week)) {
      cohorts.set(d.cohort_week, [])
    }
    cohorts.get(d.cohort_week)!.push(d)
  })

  const cohortKeys = Array.from(cohorts.keys()).sort().slice(-6)

  return (
    <div className="plate p-5 animate-scale-in stagger-2" style={{ animationDelay: '300ms' }}>
      <h3 className="f1-m text-[10px] font-bold uppercase tracking-widest text-black/80 mb-4 relative z-10 border-b border-black/20 pb-3 shadow-[0_1px_0_rgba(255,255,255,0.3)]">
        Retention Matrix
      </h3>
      <div className="overflow-x-auto relative z-10 bg-black/5 rounded-sm p-2 border border-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.5)]">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 font-bold uppercase tracking-widest text-[10px]" style={{ color: '#444' }}>
                Cohort ID
              </th>
              {[0, 1, 2, 3, 4].map((w) => (
                <th key={w} className="text-center px-2 py-2 font-bold uppercase tracking-widest text-[10px]" style={{ color: '#444' }}>
                  W{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohortKeys.map((week) => {
              const weekData = cohorts.get(week) || []
              return (
                <tr key={week} className="border-t border-black/5">
                  <td className="px-2 py-2 font-bold text-[10px]" style={{ color: '#444' }}>
                    {week}
                  </td>
                  {[0, 1, 2, 3, 4].map((wn) => {
                    const cell = weekData.find((d) => d.week_number === wn)
                    const rate = cell?.retention_rate || 0
                    return (
                      <td key={wn} className="text-center px-1 py-1">
                        <span
                          className="inline-flex items-center justify-center w-full h-8 rounded-sm font-bold text-[10px] border border-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                          style={{
                            background: getHeatmapColor(rate),
                            color: rate > 40 ? '#fff' : rate > 0 ? '#111' : '#666',
                            textShadow: rate > 40 ? '0 1px 0 rgba(0,0,0,0.5)' : 'none',
                          }}
                        >
                          {rate > 0 ? `${rate}%` : '-'}
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