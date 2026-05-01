'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePulseStore } from '@/store'
import { canAccess } from '@/lib/plans'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

// --- SEVERITY CONFIG (Metallic/Silver theme) ---
const SEVERITY_CONFIG: Record<string, { badgeColor: string; bgClass: string }> = {
  critical: { badgeColor: 'text-red-700', bgClass: 'bg-red-500/10 border-red-500/30' },
  high: { badgeColor: 'text-orange-700', bgClass: 'bg-orange-500/10 border-orange-500/30' },
  medium: { badgeColor: 'text-blue-700', bgClass: 'bg-blue-500/10 border-blue-500/30' },
  low: { badgeColor: 'text-slate-600', bgClass: 'bg-slate-500/10 border-slate-500/30' },
}

export default function AIInsightsPage() {
  const params = useParams()
  const router = useRouter()
  const programId = params.programId as string

  const {
    user,
    activeProgram,
    insightsByProgram,
    setInsights,
    isGeneratingInsights,
    setGeneratingInsights,
  } = usePulseStore()

  const insights = programId ? insightsByProgram[programId] : null
  const hasAccess = canAccess(user.plan, 'ai_insights')
  const [error, setError] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState(0)
  const hasAttempted = useRef(false)

  useEffect(() => {
    // If no access, redirect back to dashboard
    if (!hasAccess && !isGeneratingInsights && !insights && !error) {
      router.push(`/dashboard/${programId}`)
      return
    }

    // Auto-generate if no insights exist
    // Fix: Add !error and ref to prevent infinite loop on failure or strict mode
    if (hasAccess && !insights && !isGeneratingInsights && !error && !hasAttempted.current) {
      hasAttempted.current = true
      handleGenerateInsights()
    }
  }, [hasAccess, insights, isGeneratingInsights, programId, router, error])

  // Fake scanning progress animation during generation
  useEffect(() => {
    if (isGeneratingInsights) {
      const interval = setInterval(() => {
        setScanProgress(p => (p >= 100 ? 0 : p + Math.random() * 5))
      }, 100)
      return () => clearInterval(interval)
    }
  }, [isGeneratingInsights])

  async function handleGenerateInsights() {
    if (!user.token || !programId) return
    setGeneratingInsights(true)
    setError(null)
    try {
      const res = await fetch(
        `${API_BASE}/insights/generate/${programId}?program_name=${encodeURIComponent(activeProgram?.name || programId)}`,
        { method: 'POST', headers: { Authorization: `Bearer ${user.token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        setInsights(programId, data)
      } else {
        const errData = await res.json()
        setError(errData.detail || errData.error || 'Failed to generate insights.')
      }
    } catch (err) {
      console.error('Insight generation failed:', err)
      setError('Network error occurred.')
    } finally {
      setGeneratingInsights(false)
    }
  }

  // Common Header (Top Rail) for consistency
  const headerElement = (
    <header className="fixed top-0 left-0 right-0 z-50 machined-panel px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(`/dashboard/${programId}`)}
          className="flex items-center gap-2 f1-m text-[10px] uppercase tracking-widest text-black/60 hover:text-black transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>
        <div className="w-px h-6 bg-black/20 shadow-[1px_0_0_rgba(255,255,255,0.3)]"></div>
        <div>
          <h1 className="text-sm f1-h font-bold text-black/80 uppercase">
            AI Intelligence Report
          </h1>
          <div className="text-[10px] f1-m flex items-center gap-1.5 mt-0.5 text-black/60 uppercase tracking-widest">
            {activeProgram?.name || programId}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[10px] hidden sm:inline-flex items-center gap-1.5 text-black/60 f1-m uppercase tracking-widest">
          <span className={`status-dot ${isGeneratingInsights ? 'on' : 'on'}`}></span>
          LangGraph Node Active
        </span>
      </div>
    </header>
  )

  // Render Error State
  if (error) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {headerElement}
        <div className="flex items-center justify-center min-h-screen px-6 pt-24 pb-20">
          <div className="plate p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-4 border border-black/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl f1-h font-bold mb-2 text-red-700 uppercase">Generation Failed</h2>
            <p className="text-black/60 text-xs f1-m uppercase tracking-widest mb-6">{error}</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => router.push(`/dashboard/${programId}`)} className="btn-ghost">
                <span className="btn-label">Abort</span>
              </button>
              <button onClick={handleGenerateInsights} className="btn-hero">
                <span className="btn-label">Retry</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render Loading State (Mindblowing Metallic Matrix-like Scan)
  if (isGeneratingInsights || (!insights && hasAccess)) {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col">
        {headerElement}
        <main className="flex-1 relative z-10 flex flex-col items-center justify-center p-8 pt-24">
          <div className="relative w-full max-w-2xl animate-fade-in">
            {/* The Scanner Box */}
            <div className="plate p-12 text-center overflow-hidden">
              {/* Scanning line */}
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
                Synthesizing Intelligence
              </h2>
              <p className="text-black/50 text-xs f1-m uppercase tracking-widest mb-8 max-w-md mx-auto">
                Running multi-agent anomaly detection across transaction graph...
              </p>

              {/* Progress Bar */}
              <div className="w-full max-w-sm mx-auto h-1 bg-black/10 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]">
                <div 
                  className="h-full bg-gradient-to-r from-black/20 via-black/40 to-black/60 rounded-full"
                  style={{ width: `${Math.min(scanProgress + 15, 100)}%`, transition: 'width 0.3s ease-out' }}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Render Finished Insights
  if (!insights) return null

  return (
    <div className="min-h-screen relative overflow-hidden">
      {headerElement}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-8 pt-24 pb-20 animate-fade-in">
        
        <div className="page-header text-left flex flex-col items-start mb-6 border-none">
          <div className="page-title">Executive Summary</div>
          <div className="page-sub">AI Diagnostic Output</div>
        </div>

        {/* Executive Summary & Health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Headline Card */}
          <div className="lg:col-span-2 plate p-8 flex flex-col justify-center">
            <div className="badge-row -mx-8 -mt-8 mb-6 px-8">
              <div className="badge">
                <div className="badge-num">AI</div>
                <div className="badge-label">Intelligence Report</div>
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl f1-h font-bold text-black/80 mb-4 uppercase">
              {insights.headline}
            </h2>
            <p className="text-black/60 text-sm f1-m leading-relaxed">
              {insights.biggest_problem}
            </p>
          </div>

          {/* Health Score Card */}
          <div className="plate p-8 flex flex-col items-center justify-center text-center">
            <h3 className="text-[10px] f1-m tracking-widest text-black/50 uppercase mb-6">System Health</h3>
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Metallic bezel */}
              <div className="absolute inset-0 rounded-full border border-black/10 bg-black/5 shadow-[inset_0_4px_10px_rgba(0,0,0,0.1)]" />
              {/* Glowing ring based on score */}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="64" cy="64" r="60" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="4" />
                <circle 
                  cx="64" cy="64" r="60" fill="none" 
                  stroke={(insights.health_score ?? 0) >= 70 ? '#10b981' : (insights.health_score ?? 0) >= 40 ? '#f59e0b' : '#ef4444'} 
                  strokeWidth="4" strokeLinecap="round" 
                  strokeDasharray="377" 
                  strokeDashoffset={377 - ((insights.health_score ?? 0) / 100) * 377}
                  style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              </svg>
              <div className="relative z-10 flex flex-col items-center">
                <span className="text-4xl f1-h font-bold text-black/80">{insights.health_score ?? 0}</span>
                <span className="text-[10px] text-black/40 f1-m mt-1">/ 100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actionable Insights Grid */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-black/40 rounded-full" />
            <h3 className="text-xl f1-h font-bold text-black/80 uppercase">Critical Anomalies</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {insights.insights?.map((insight: any, idx: number) => {
              const conf = SEVERITY_CONFIG[insight.severity?.toLowerCase()] || SEVERITY_CONFIG.low
              return (
                <div key={idx} className="card flex flex-col h-full">
                  <div className="badge-row">
                    <div className="badge">
                      <div className="badge-label">{insight.severity}</div>
                    </div>
                    <span className="tag">{insight.metric_reference}</span>
                  </div>
                  
                  <div className={`p-6 flex-1 flex flex-col border-t border-black/5`}>
                    <h4 className="text-lg f1-h font-bold text-black/80 mb-3 uppercase">
                      {insight.finding}
                    </h4>
                    <p className="text-xs f1-m text-black/60 leading-relaxed mb-6 flex-1">
                      {insight.why_it_matters}
                    </p>
                    
                    <div className="mt-auto pt-4 border-t border-black/10">
                      <div className="flex gap-3">
                        <svg className={`w-4 h-4 shrink-0 mt-0.5 ${conf.badgeColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <p className="text-xs f1-m font-bold text-black/70">
                          {insight.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Retention & Quick Wins row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
          {insights.retention_diagnosis && (
            <div className="plate p-8 group">
              <h3 className="text-lg f1-h font-bold text-black/80 mb-6 flex items-center gap-3 uppercase">
                <svg className="w-5 h-5 text-black/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Retention Matrix
                {insights.retention_diagnosis.retention_grade && (
                  <span className="ml-auto text-[10px] f1-m text-black/40">
                    GRADE: <span className="text-black/80 font-bold">{insights.retention_diagnosis.retention_grade}</span>
                  </span>
                )}
              </h3>
              
              <div className="space-y-4 relative z-10">
                <div className="p-4 rounded-sm border border-black/10 bg-black/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)]">
                  <p className="text-[10px] f1-m text-black/50 uppercase tracking-widest mb-2">Primary Churn Vector</p>
                  <p className="text-xs f1-m text-black/80">{insights.retention_diagnosis.main_churn_trigger}</p>
                </div>
                <div className="p-4 rounded-sm border border-black/10 bg-black/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)]">
                  <p className="text-[10px] f1-m text-black/50 uppercase tracking-widest mb-2">Power User Signature</p>
                  <p className="text-xs f1-m text-black/80">{insights.retention_diagnosis.power_user_signal}</p>
                </div>
              </div>
            </div>
          )}

          {insights.quick_wins?.length > 0 && (
            <div className="plate p-8 group">
              <h3 className="text-lg f1-h font-bold text-black/80 mb-6 flex items-center gap-3 uppercase">
                <svg className="w-5 h-5 text-black/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Immediate Actions
              </h3>
              
              <div className="space-y-3 relative z-10">
                {insights.quick_wins.map((win: string, i: number) => (
                  <div key={i} className="flex gap-3 items-start p-3 rounded-sm hover:bg-black/5 transition-colors border border-transparent hover:border-black/10">
                    <span className="text-black/40 mt-0.5">▹</span>
                    <span className="text-xs f1-m text-black/70 leading-relaxed">{win}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
