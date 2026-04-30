'use client'

/**
 * Dashboard Chart Components — Premium Warm Design
 * Cream / Rose / Charcoal Palette
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
  const trendColor = trend === 'up' ? '#2C2420' : trend === 'down' ? '#B5623E' : '#7A6860'
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''

  return (
    <div className="metric-card animate-scale-in hover:scale-[1.02] transition-all duration-300" style={{ transformOrigin: 'center top' }}>
      <p className="text-xs font-medium mb-1" style={{ color: '#7A6860' }}>
        {label}
      </p>
      <p className="text-2xl font-serif font-bold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
        {value}
      </p>
      {subtext && (
        <p className="text-xs mt-1.5 flex items-center gap-1 animate-fade-in" style={{ color: trendColor }}>
          {trendIcon && <span>{trendIcon}</span>}
          {subtext}
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
    <div className="glass rounded-lg px-3 py-2 text-xs" style={{ background: '#EDE3D4', border: '1px solid rgba(180,140,120,0.35)' }}>
      <p className="font-serif font-medium mb-1" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export function DAWChart({ data }: DAWChartProps) {
  return (
    <div className="card p-5 animate-scale-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-serif font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
          Daily Active Wallets (30d)
        </h3>
        <div className="flex items-center gap-3 text-xs" style={{ color: '#7A6860' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D4825A]"></span>
            New
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#E8B89A]"></span>
            Returning
          </span>
        </div>
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#D4825A" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#D4825A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradReturn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E8B89A" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#E8B89A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(180,140,120,0.2)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#7A6860', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(180,140,120,0.2)' }}
            />
            <YAxis
              tick={{ fill: '#7A6860', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="new_wallets"
              name="New"
              stackId="1"
              stroke="#D4825A"
              fill="url(#gradNew)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="returning_wallets"
              name="Returning"
              stackId="1"
              stroke="#E8B89A"
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
  const colors = ['#D4825A', '#E8B89A', '#7A6860', '#B5623E', '#8C4A2C']

  return (
    <div className="card p-5 animate-scale-in stagger-1" style={{ animationDelay: '150ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-serif font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
          Transaction Funnel
        </h3>
        <div className="flex gap-2 flex-wrap">
          {data.slice(1).map((step) => (
            <span
              key={step.step}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: step.drop_off_rate > 50 ? 'rgba(181,98,62,0.15)' : '#EDE3D4',
                color: step.drop_off_rate > 50 ? '#B5623E' : '#7A6860',
                border: `1px solid ${step.drop_off_rate > 50 ? 'rgba(181,98,62,0.3)' : 'rgba(180,140,120,0.2)'}`,
              }}
            >
              Step {step.step}: -{step.drop_off_rate}%
            </span>
          ))}
        </div>
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(180,140,120,0.2)" />
            <XAxis
              dataKey="label"
              tick={{ fill: '#7A6860', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(180,140,120,0.2)' }}
            />
            <YAxis
              tick={{ fill: '#7A6860', fontSize: 10 }}
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
  if (rate >= 80) return 'rgba(212, 130, 90, 0.5)'
  if (rate >= 60) return 'rgba(212, 130, 90, 0.35)'
  if (rate >= 40) return 'rgba(212, 130, 90, 0.25)'
  if (rate >= 20) return 'rgba(212, 130, 90, 0.15)'
  if (rate > 0) return 'rgba(212, 130, 90, 0.08)'
  return '#EDE3D4'
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
    <div className="card p-5 animate-scale-in stagger-2" style={{ animationDelay: '300ms' }}>
      <h3 className="text-sm font-serif font-semibold mb-4" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
        Retention Cohorts
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 font-medium" style={{ color: '#7A6860' }}>
                Cohort
              </th>
              {[0, 1, 2, 3, 4].map((w) => (
                <th key={w} className="text-center px-2 py-2 font-medium" style={{ color: '#7A6860' }}>
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
                  <td className="px-2 py-2 font-mono" style={{ color: '#7A6860' }}>
                    {week}
                  </td>
                  {[0, 1, 2, 3, 4].map((wn) => {
                    const cell = weekData.find((d) => d.week_number === wn)
                    const rate = cell?.retention_rate || 0
                    return (
                      <td key={wn} className="text-center px-2 py-2">
                        <span
                          className="inline-block w-full rounded px-2 py-1 font-medium"
                          style={{
                            background: getHeatmapColor(rate),
                            color: rate > 0 ? '#2C2420' : '#7A6860',
                          }}
                        >
                          {rate > 0 ? `${rate}%` : '—'}
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