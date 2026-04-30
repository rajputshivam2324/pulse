'use client'

/**
 * InsightsPanel — Premium Warm Design
 * Timeline-based visualization with enhanced insight cards
 */

import { useEffect, useState } from 'react'

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

const TIMELINE_STEPS = [
  { id: 'fetching', label: 'Fetching metrics from Helius' },
  { id: 'analyzing', label: 'Analyzing transaction patterns' },
  { id: 'detecting', label: 'Detecting anomalies' },
  { id: 'ranking', label: 'Ranking by severity' },
  { id: 'generating', label: 'Generating recommendations' },
  { id: 'scoring', label: 'Computing health score' },
]

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  critical: { bg: 'rgba(181,98,62,0.15)', text: '#B5623E', border: 'rgba(181,98,62,0.3)', icon: '●' },
  high: { bg: 'rgba(212,130,90,0.15)', text: '#D4825A', border: 'rgba(212,130,90,0.3)', icon: '◐' },
  medium: { bg: 'rgba(168,151,142,0.15)', text: '#7A6860', border: 'rgba(168,151,142,0.3)', icon: '○' },
  low: { bg: 'rgba(122,104,96,0.15)', text: '#A8978E', border: 'rgba(122,104,96,0.3)', icon: '○' },
}

function getHealthColor(score: number): string {
  if (score >= 70) return '#2C2420'
  if (score >= 40) return '#D4825A'
  return '#B5623E'
}

function HealthGauge({ score }: { score: number }) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const color = getHealthColor(score)
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (animatedScore / 100) * circumference

  useEffect(() => {
    const duration = 1500
    const steps = 60
    const increment = score / steps
    let current = 0
    const interval = setInterval(() => {
      current += increment
      if (current >= score) {
        setAnimatedScore(score)
        clearInterval(interval)
      } else {
        setAnimatedScore(Math.floor(current))
      }
    }, duration / steps)
    return () => clearInterval(interval)
  }, [score])

  return (
    <div className="health-ring animate-scale-bounce" style={{ width: 100, height: 100, animationDelay: '300ms' }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="rgba(180,140,120,0.35)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ 
            transition: 'stroke-dashoffset 1.5s ease-out',
            filter: `drop-shadow(0 0 6px ${color}40)`
          }}
        />
      </svg>
      <span className="font-serif text-2xl font-bold" style={{ color }}>{animatedScore}</span>
    </div>
  )
}

export function InsightsPanel({ data, isLoading }: InsightsPanelProps) {
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setActiveStep((prev) => (prev < TIMELINE_STEPS.length - 1 ? prev + 1 : prev))
      }, 800)
      return () => clearInterval(interval)
    } else {
      setActiveStep(0)
    }
  }, [isLoading])

  if (isLoading) {
    return (
      <div className="card p-6" style={{ background: '#F5EFE6' }}>
        <div className="flex items-start gap-6">
          {/* Timeline */}
          <div className="hidden lg:block w-56 shrink-0">
            <h4 className="text-xs font-medium mb-4" style={{ color: '#7A6860', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ANALYZING
            </h4>
            <div className="space-y-0">
              {TIMELINE_STEPS.map((step, idx) => {
                const isCompleted = idx < activeStep
                const isActive = idx === activeStep
                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-3"
                    style={{
                      opacity: isCompleted ? 1 : isActive ? 0.8 : 0.4,
                      paddingBottom: '0.75rem',
                    }}
                  >
                    <div className={`w-2 h-2 rounded-full transition-all ${
                      isCompleted
                        ? 'bg-[#D4825A]'
                        : isActive
                        ? 'bg-[#E8B89A] animate-pulse'
                        : 'bg-[rgba(180,140,120,0.35)]'
                    }`} />
                    <span className="text-xs" style={{ color: isCompleted ? '#2C2420' : '#7A6860' }}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Loading content */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" style={{ color: '#D4825A' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
              </svg>
              <span className="text-sm font-medium" style={{ color: '#B5623E' }}>
                LangGraph pipeline running...
              </span>
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="shimmer h-16 rounded-xl"
                  style={{
                    width: `${100 - i * 15}%`,
                    animationDelay: `${i * 0.15}s`,
                    background: 'linear-gradient(90deg, #F5EFE6 25%, #EDE3D4 50%, #F5EFE6 75%)',
                    backgroundSize: '200% 100%',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const healthColor = getHealthColor(data.health_score)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Health Score + Headline */}
      <div className="card p-6" style={{ background: '#F5EFE6', border: '1px solid rgba(180,140,120,0.2)' }}>
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(242,218,206,0.5)',
                  color: '#B5623E',
                }}
              >
                HEALTH SCORE
              </span>
            </div>
            <h3 className="text-xl font-serif font-bold mb-2" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
              {data.headline}
            </h3>
            <p className="text-sm" style={{ color: '#7A6860' }}>
              {data.biggest_problem}
            </p>
          </div>
          <HealthGauge score={data.health_score} />
        </div>
      </div>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.insights.map((insight, idx) => {
          const config = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.low
          return (
            <div
              key={insight.id || idx}
              className="card flex flex-col gap-3 animate-scale-in hover:scale-[1.02] transition-all duration-300"
              style={{ 
                animationDelay: `${idx * 0.1}s`, 
                background: '#F5EFE6',
                transformOrigin: 'center top',
                boxShadow: '0 4px 20px rgba(44, 36, 32, 0.08)'
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1.5"
                  style={{
                    background: config.bg,
                    color: config.text,
                    border: `1px solid ${config.border}`,
                  }}
                >
                  <span style={{ fontSize: 6 }}>{config.icon}</span>
                  {insight.severity.toUpperCase()}
                </span>
                <span className="text-xs ml-auto font-mono" style={{ color: '#A8978E' }}>
                  {insight.metric_reference}
                </span>
              </div>

              {/* Finding */}
              <p className="text-sm font-serif font-medium" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
                {insight.finding}
              </p>

              {/* Why it matters */}
              <p className="text-xs leading-relaxed" style={{ color: '#7A6860' }}>
                {insight.why_it_matters}
              </p>

              {/* Recommendation */}
              <div className="mt-auto pt-3" style={{ borderTop: '1px solid rgba(180,140,120,0.2)' }}>
                <p className="text-xs font-medium" style={{ color: '#B5623E' }}>
                  → {insight.recommendation}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Retention Diagnosis */}
      {data.retention_diagnosis && (
        <div className="card p-5" style={{ background: '#F5EFE6' }}>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#D4825A' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 className="text-sm font-serif font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
              Retention Diagnosis
            </h4>
            {data.retention_diagnosis.retention_grade && (
              <span
                className="text-xs font-serif font-bold px-2 py-0.5 rounded-full ml-auto"
                style={{
                  background: 'rgba(242,218,206,0.5)',
                  color: '#B5623E',
                }}
              >
                Grade: {data.retention_diagnosis.retention_grade}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg" style={{ background: '#FAF7F2' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#7A6860' }}>Main churn trigger</p>
              <p className="text-sm" style={{ color: '#2C2420' }}>
                {data.retention_diagnosis.main_churn_trigger}
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: '#FAF7F2' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#7A6860' }}>Power user signal</p>
              <p className="text-sm" style={{ color: '#2C2420' }}>
                {data.retention_diagnosis.power_user_signal}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Wins */}
      {data.quick_wins.length > 0 && (
        <div className="card p-5" style={{ background: '#F5EFE6' }}>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#D4825A' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h4 className="text-sm font-serif font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
              Quick Wins
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.quick_wins.map((win, i) => (
              <span
                key={i}
                className="text-xs px-3 py-2 rounded-full font-medium"
                style={{
                  background: 'rgba(122,104,96,0.15)',
                  color: '#7A6860',
                  border: '1px solid rgba(122,104,96,0.2)',
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