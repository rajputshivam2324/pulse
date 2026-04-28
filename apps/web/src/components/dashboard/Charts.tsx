'use client'

/**
 * Dashboard Chart Components
 * DAW Area Chart, Transaction Funnel, Retention Cohort Grid, Metric Cards
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
  value: string | number
  subtext?: string
  trend?: 'up' | 'down' | 'neutral'
}

export function MetricCard({ label, value, subtext, trend }: MetricCardProps) {
  const trendColor =
    trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : 'var(--color-text-muted)'
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''

  return (
    <div className="metric-card">
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
        {value}
      </p>
      {subtext && (
        <p className="text-xs mt-1" style={{ color: trendColor }}>
          {trendIcon} {subtext}
        </p>
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null
  return (
    <div
      className="glass rounded-lg px-3 py-2 text-xs"
      style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)' }}
    >
      <p className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  )
}

export function DAWChart({ data }: DAWChartProps) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
        Daily Active Wallets (30d)
      </h3>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradReturn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-subtle)' }}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="new_wallets"
              name="New"
              stackId="1"
              stroke="#8b5cf6"
              fill="url(#gradNew)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="returning_wallets"
              name="Returning"
              stackId="1"
              stroke="#06b6d4"
              fill="url(#gradReturn)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} /> New wallets
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: '#06b6d4' }} /> Returning
        </span>
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
  const colors = ['#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95']

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
        Transaction Funnel
      </h3>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-subtle)' }}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="wallet_count" name="Wallets" radius={[6, 6, 0, 0]}>
              {data.map((_, idx) => (
                <Cell key={idx} fill={colors[idx % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-3 mt-3 flex-wrap">
        {data.slice(1).map((step) => (
          <span
            key={step.step}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: step.drop_off_rate > 50 ? 'var(--color-danger-subtle)' : 'var(--color-bg-elevated)',
              color: step.drop_off_rate > 50 ? '#fca5a5' : 'var(--color-text-muted)',
              border: `1px solid ${step.drop_off_rate > 50 ? 'rgba(239,68,68,0.3)' : 'var(--color-border-subtle)'}`,
            }}
          >
            Step {step.step}: -{step.drop_off_rate}%
          </span>
        ))}
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
  if (rate >= 80) return 'rgba(139, 92, 246, 0.7)'
  if (rate >= 60) return 'rgba(139, 92, 246, 0.5)'
  if (rate >= 40) return 'rgba(139, 92, 246, 0.35)'
  if (rate >= 20) return 'rgba(139, 92, 246, 0.2)'
  if (rate > 0) return 'rgba(139, 92, 246, 0.1)'
  return 'var(--color-bg-elevated)'
}

export function RetentionGrid({ data }: RetentionGridProps) {
  // Group by cohort week
  const cohorts = new Map<string, Array<{ week_number: number; retention_rate: number; wallet_count: number }>>()
  data.forEach((d) => {
    if (!cohorts.has(d.cohort_week)) {
      cohorts.set(d.cohort_week, [])
    }
    cohorts.get(d.cohort_week)!.push(d)
  })

  const cohortKeys = Array.from(cohorts.keys()).sort().slice(-6) // Last 6 cohorts

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
        Retention Cohorts
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Cohort
              </th>
              {[0, 1, 2, 3, 4].map((w) => (
                <th key={w} className="text-center px-2 py-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  W{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohortKeys.map((week) => {
              const weekData = cohorts.get(week) || []
              return (
                <tr key={week}>
                  <td className="px-2 py-1.5 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {week}
                  </td>
                  {[0, 1, 2, 3, 4].map((wn) => {
                    const cell = weekData.find((d) => d.week_number === wn)
                    const rate = cell?.retention_rate || 0
                    return (
                      <td key={wn} className="text-center px-2 py-1.5">
                        <span
                          className="inline-block w-full rounded px-2 py-1 font-medium"
                          style={{
                            background: getHeatmapColor(rate),
                            color: rate > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
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
