'use client'

/**
 * InsightsPanel — Renders LangGraph AI output.
 * Shows health score, headline, severity-coded insight cards, retention diagnosis, and quick wins.
 */

interface InsightItem {
  id: string
  finding: string
  why_it_matters: string
  severity: string
  recommendation: string
  metric_reference: string
}

interface InsightsPanelProps {
  data: {
    headline: string
    biggest_problem: string
    health_score: number
    insights: InsightItem[]
    retention_diagnosis: {
      d7_assessment?: string
      d30_assessment?: string
      main_churn_trigger?: string
      power_user_signal?: string
      retention_grade?: string
    } | null
    quick_wins: string[]
  } | null
  isLoading?: boolean
}

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  critical: { bg: 'var(--color-danger-subtle)', text: '#fca5a5', border: 'rgba(239, 68, 68, 0.3)', emoji: '🔴' },
  high: { bg: 'var(--color-warning-subtle)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.3)', emoji: '🟠' },
  medium: { bg: 'var(--color-info-subtle)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.3)', emoji: '🟡' },
  low: { bg: 'var(--color-success-subtle)', text: '#86efac', border: 'rgba(34, 197, 94, 0.3)', emoji: '🔵' },
}

function getHealthColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

export function InsightsPanel({ data, isLoading }: InsightsPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <svg className="animate-spin h-5 w-5" style={{ color: 'var(--color-brand)' }} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
            </svg>
            <span className="text-sm font-medium" style={{ color: 'var(--color-brand-light)' }}>
              LangGraph pipeline running — analyzing metrics across 7 nodes...
            </span>
          </div>
          <div className="space-y-2">
            {['Detecting anomalies', 'Ranking by severity', 'Generating insights', 'Diagnosing retention', 'Computing health score'].map((step, i) => (
              <div key={step} className="shimmer h-4 rounded" style={{ width: `${80 - i * 10}%`, animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const healthColor = getHealthColor(data.health_score)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Health + Headline */}
      <div className="card p-6" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
              {data.headline}
            </h3>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {data.biggest_problem}
            </p>
          </div>
          <div
            className="health-ring shrink-0"
            style={{
              '--ring-color': healthColor,
              '--ring-percent': data.health_score,
              background: 'var(--color-bg-card)',
              color: healthColor,
            } as React.CSSProperties}
          >
            {data.health_score}
          </div>
        </div>
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.insights.map((insight, idx) => {
          const config = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.low
          return (
            <div
              key={insight.id || idx}
              className="card flex flex-col gap-3 animate-fade-in"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="flex items-center gap-2">
                <span>{config.emoji}</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: config.bg,
                    color: config.text,
                    border: `1px solid ${config.border}`,
                  }}
                >
                  {insight.severity.toUpperCase()}
                </span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>
                  {insight.metric_reference}
                </span>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {insight.finding}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {insight.why_it_matters}
              </p>
              <div
                className="mt-auto pt-3"
                style={{ borderTop: '1px solid var(--color-border-subtle)' }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--color-brand-light)' }}>
                  → {insight.recommendation}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Retention diagnosis */}
      {data.retention_diagnosis && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🎯</span>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Retention Diagnosis
            </h4>
            {data.retention_diagnosis.retention_grade && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full ml-auto"
                style={{
                  background: 'var(--color-brand-subtle)',
                  color: 'var(--color-brand-light)',
                }}
              >
                Grade: {data.retention_diagnosis.retention_grade}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Main churn trigger</p>
              <p style={{ color: 'var(--color-text-secondary)' }}>{data.retention_diagnosis.main_churn_trigger}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Power user signal</p>
              <p style={{ color: 'var(--color-text-secondary)' }}>{data.retention_diagnosis.power_user_signal}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick wins */}
      {data.quick_wins.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">⚡</span>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Quick Wins
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.quick_wins.map((win, i) => (
              <span
                key={i}
                className="text-xs px-3 py-1.5 rounded-full"
                style={{
                  background: 'var(--color-success-subtle)',
                  color: '#86efac',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                }}
              >
                {win}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
