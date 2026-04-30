'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePulseStore } from '@/store'
import { canAccess } from '@/lib/plans'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

// --- SEVERITY CONFIG (Metallic/Neon theme) ---
// No purple/violet! Using Cyan, Amber, Rose, Slate
const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  critical: { bg: 'rgba(225, 29, 72, 0.1)', text: '#fb7185', border: 'rgba(225, 29, 72, 0.4)', glow: 'rgba(225, 29, 72, 0.5)' },
  high: { bg: 'rgba(217, 119, 6, 0.1)', text: '#fbbf24', border: 'rgba(217, 119, 6, 0.4)', glow: 'rgba(217, 119, 6, 0.5)' },
  medium: { bg: 'rgba(8, 145, 178, 0.1)', text: '#22d3ee', border: 'rgba(8, 145, 178, 0.4)', glow: 'rgba(8, 145, 178, 0.5)' },
  low: { bg: 'rgba(71, 85, 105, 0.1)', text: '#94a3b8', border: 'rgba(71, 85, 105, 0.4)', glow: 'rgba(71, 85, 105, 0.5)' },
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
  
  // Animation states for the loading sequence
  const [scanProgress, setScanProgress] = useState(0)

  useEffect(() => {
    // If no access, redirect back to dashboard
    if (!hasAccess && !isGeneratingInsights && !insights) {
      router.push(`/dashboard/${programId}`)
      return
    }

    // Auto-generate if no insights exist
    if (hasAccess && !insights && !isGeneratingInsights) {
      handleGenerateInsights()
    }
  }, [hasAccess, insights, isGeneratingInsights, programId, router])

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
        setError(errData.detail || 'Failed to generate insights.')
      }
    } catch (err) {
      console.error('Insight generation failed:', err)
      setError('Network error occurred.')
    } finally {
      setGeneratingInsights(false)
    }
  }

  // Render Error State
  if (error) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-200 p-8 flex items-center justify-center">
        <div className="max-w-md w-full p-8 rounded-2xl border border-red-900/50 bg-red-950/20 backdrop-blur-xl text-center shadow-[0_0_40px_rgba(220,38,38,0.1)]">
          <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-4 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.5)]">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold mb-2 text-red-400">Generation Failed</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <div className="flex gap-4 justify-center">
            <button onClick={() => router.push(`/dashboard/${programId}`)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
              Go Back
            </button>
            <button onClick={handleGenerateInsights} className="px-4 py-2 text-sm bg-red-900/50 hover:bg-red-800/50 text-red-200 border border-red-700 rounded-lg transition-all shadow-[0_0_10px_rgba(220,38,38,0.2)]">
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render Loading State (Mindblowing Metallic Matrix-like Scan)
  if (isGeneratingInsights || (!insights && hasAccess)) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-200 relative overflow-hidden flex flex-col">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#0f172a,transparent_50%)] opacity-60" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,rgba(8,145,178,0.05),transparent_70%)]" />
        
        {/* Top Navbar */}
        <header className="relative z-10 px-8 py-6 flex items-center justify-between border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-md">
          <button onClick={() => router.push(`/dashboard/${programId}`)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium tracking-wide">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            BACK TO DASHBOARD
          </button>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-pulse" />
            <span className="text-xs text-cyan-400 font-mono tracking-widest uppercase">LangGraph Node Active</span>
          </div>
        </header>

        {/* Central Scanner */}
        <main className="flex-1 relative z-10 flex flex-col items-center justify-center p-8">
          <div className="relative w-full max-w-2xl">
            {/* The Scanner Box */}
            <div className="absolute inset-0 rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur-2xl shadow-[inset_0_0_40px_rgba(15,23,42,0.8)]" />
            
            {/* Glowing borders */}
            <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-slate-600/30 via-transparent to-slate-800/30 opacity-50" />
            
            <div className="relative p-12 text-center overflow-hidden rounded-3xl">
              {/* Scanning line */}
              <div 
                className="absolute left-0 right-0 h-[2px] bg-cyan-400 shadow-[0_0_20px_4px_rgba(34,211,238,0.3)] opacity-70"
                style={{ top: `${scanProgress}%`, transition: 'top 0.1s linear' }}
              />

              <div className="mb-8 relative inline-block">
                <div className="w-24 h-24 rounded-full border-2 border-slate-700/50 flex items-center justify-center relative z-10 bg-slate-900/80">
                  <svg className="w-10 h-10 text-slate-300 animate-[spin_4s_linear_infinite]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                    <circle cx="12" cy="12" r="10" strokeDasharray="16 16" />
                    <circle cx="12" cy="12" r="6" strokeDasharray="8 8" className="text-cyan-500" />
                  </svg>
                </div>
                {/* Glow ring */}
                <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-xl animate-pulse" />
              </div>

              <h2 className="text-2xl font-light text-slate-200 mb-2 tracking-wide font-serif">
                Synthesizing Intelligence
              </h2>
              <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto font-mono">
                Running multi-agent anomaly detection across transaction graph...
              </p>

              {/* Progress Bar */}
              <div className="w-full max-w-sm mx-auto h-1 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-slate-600 via-cyan-500 to-slate-400 rounded-full"
                  style={{ width: `${Math.min(scanProgress + 15, 100)}%`, transition: 'width 0.3s ease-out' }}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Render Finished Insights (The "Fucking Awesome" State)
  if (!insights) return null

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 relative overflow-x-hidden selection:bg-cyan-900 selection:text-cyan-100">
      {/* Dynamic Backgrounds */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.8),#020617_60%)]" />
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-[radial-gradient(circle_at_center,rgba(8,145,178,0.06),transparent_70%)]" />
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-[radial-gradient(circle_at_center,rgba(51,65,85,0.1),transparent_50%)]" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-20 px-8 py-5 flex items-center justify-between border-b border-slate-800/50 bg-slate-900/40 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <button onClick={() => router.push(`/dashboard/${programId}`)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium tracking-wide group">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center group-hover:bg-slate-700 group-hover:border-slate-600 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </div>
          </button>
          <div className="w-px h-8 bg-slate-800" />
          <div>
            <h1 className="text-lg font-light tracking-wide text-white flex items-center gap-3">
              <span className="font-serif">AI Intelligence Report</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-widest bg-cyan-950 text-cyan-400 border border-cyan-800/50 uppercase">
                Classified
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{activeProgram?.name || programId}</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 space-y-8 animate-fade-in">
        
        {/* Executive Summary & Health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Headline Card (Metallic styling) */}
          <div className="lg:col-span-2 relative p-[1px] rounded-2xl bg-gradient-to-b from-slate-600/50 to-slate-800/20 overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
            <div className="h-full bg-slate-900/90 backdrop-blur-xl rounded-2xl p-8 flex flex-col justify-center relative overflow-hidden">
              {/* Subtle grid pattern */}
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-50" />
              
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]" />
                  <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">Executive Summary</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-serif font-light leading-tight text-white mb-4 drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)]">
                  {insights.headline}
                </h2>
                <p className="text-slate-400 text-sm md:text-base max-w-2xl font-light leading-relaxed">
                  {insights.biggest_problem}
                </p>
              </div>
            </div>
          </div>

          {/* Health Score Card */}
          <div className="relative p-[1px] rounded-2xl bg-gradient-to-br from-slate-700/50 via-slate-800/30 to-slate-900/50 overflow-hidden">
            <div className="h-full bg-slate-900/80 backdrop-blur-xl rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <h3 className="text-xs font-mono tracking-widest text-slate-500 uppercase mb-6">System Health</h3>
              <div className="relative w-32 h-32 flex items-center justify-center">
                {/* Metallic bezel */}
                <div className="absolute inset-0 rounded-full border border-slate-700/50 bg-slate-800/20 shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)]" />
                {/* Glowing ring based on score */}
                <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                  <circle cx="64" cy="64" r="60" fill="none" stroke="rgba(51,65,85,0.3)" strokeWidth="4" />
                  <circle 
                    cx="64" cy="64" r="60" fill="none" 
                    stroke={(insights.health_score ?? 0) >= 70 ? '#22d3ee' : (insights.health_score ?? 0) >= 40 ? '#fbbf24' : '#fb7185'} 
                    strokeWidth="4" strokeLinecap="round" 
                    strokeDasharray="377" 
                    strokeDashoffset={377 - ((insights.health_score ?? 0) / 100) * 377}
                    style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                  />
                </svg>
                <div className="relative z-10 flex flex-col items-center">
                  <span className="text-4xl font-light font-serif text-white tracking-tighter">{insights.health_score ?? 0}</span>
                  <span className="text-[10px] text-slate-500 font-mono mt-1">/ 100</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actionable Insights Grid */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            <h3 className="text-xl font-serif text-slate-200">Critical Anomalies</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {insights.insights?.map((insight: any, idx: number) => {
              const conf = SEVERITY_CONFIG[insight.severity?.toLowerCase()] || SEVERITY_CONFIG.low
              return (
                <div key={idx} className="group relative rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-600 transition-all duration-300 overflow-hidden flex flex-col shadow-lg hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                  {/* Subtle top glow line */}
                  <div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `linear-gradient(90deg, transparent, ${conf.glow}, transparent)` }} />
                  
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <span className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest rounded bg-slate-950 border" style={{ color: conf.text, borderColor: conf.border, boxShadow: `0 0 10px ${conf.bg}` }}>
                        {insight.severity}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-800/50 px-2 py-1 rounded">
                        {insight.metric_reference}
                      </span>
                    </div>
                    <h4 className="text-lg font-serif text-slate-200 mb-3 group-hover:text-white transition-colors">
                      {insight.finding}
                    </h4>
                    <p className="text-sm text-slate-400 font-light leading-relaxed mb-6 flex-1">
                      {insight.why_it_matters}
                    </p>
                    
                    <div className="mt-auto pt-4 border-t border-slate-800/50">
                      <div className="flex gap-3">
                        <svg className="w-5 h-5 shrink-0 mt-0.5" style={{ color: conf.text }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <p className="text-sm text-slate-300 font-medium">
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
            <div className="relative rounded-2xl border border-slate-800 bg-slate-900/50 p-8 overflow-hidden group">
              <div className="absolute right-0 top-0 w-64 h-64 bg-cyan-900/10 blur-3xl rounded-full pointer-events-none group-hover:bg-cyan-900/20 transition-all duration-700" />
              <h3 className="text-lg font-serif text-slate-200 mb-6 flex items-center gap-3">
                <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Retention Matrix
                {insights.retention_diagnosis.retention_grade && (
                  <span className="ml-auto text-xs font-mono text-slate-400">
                    GRADE: <span className="text-white">{insights.retention_diagnosis.retention_grade}</span>
                  </span>
                )}
              </h3>
              
              <div className="space-y-4 relative z-10">
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/50">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">Primary Churn Vector</p>
                  <p className="text-sm text-slate-300">{insights.retention_diagnosis.main_churn_trigger}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/50">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">Power User Signature</p>
                  <p className="text-sm text-slate-300">{insights.retention_diagnosis.power_user_signal}</p>
                </div>
              </div>
            </div>
          )}

          {insights.quick_wins?.length > 0 && (
            <div className="relative rounded-2xl border border-slate-800 bg-slate-900/50 p-8 overflow-hidden group">
              <div className="absolute right-0 bottom-0 w-64 h-64 bg-emerald-900/10 blur-3xl rounded-full pointer-events-none group-hover:bg-emerald-900/20 transition-all duration-700" />
              <h3 className="text-lg font-serif text-slate-200 mb-6 flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                Immediate Actions
              </h3>
              
              <div className="space-y-3 relative z-10">
                {insights.quick_wins.map((win: string, i: number) => (
                  <div key={i} className="flex gap-3 items-start p-3 rounded-lg hover:bg-slate-800/30 transition-colors">
                    <span className="text-emerald-500 mt-0.5 opacity-80">▹</span>
                    <span className="text-sm text-slate-300 leading-relaxed">{win}</span>
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
