'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { usePulseStore } from '@/store'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
)

import AnimatedMetallicBackground from '@/components/AnimatedMetallicBackground'

export default function LandingPage() {
  const { connected } = useWallet()
  const router = useRouter()
  const activeProgram = usePulseStore((s) => s.activeProgram)

  useEffect(() => {
    if (connected && activeProgram) {
      router.push(`/dashboard/${activeProgram.programAddress}`)
    }
  }, [connected, activeProgram, router])

  const handleGetStarted = () => {
    if (connected) {
      router.push('/onboarding')
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      
      {/* HTML5 Canvas Animated Metallic Background */}
      <AnimatedMetallicBackground />
      {/* Navigation (Top Rail) */}
      <nav className="fixed top-0 left-0 right-0 z-50 machined-panel px-8 py-3 flex items-center justify-between">
        <Link href="/" className="logo flex items-center gap-3 no-underline group">
          <div className="w-8 h-8 rounded-sm bg-gradient-to-b from-[#444] to-[#111] flex items-center justify-center border border-[#000] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
            <span className="text-[#fff] text-xs font-mono font-bold">P-8</span>
          </div>
          <span className="f1-h text-xl font-bold uppercase tracking-widest text-black">Pulse</span>
        </Link>
        <div className="flex items-center gap-4">
          <a href="#features" className="f1-h text-xs font-bold uppercase tracking-widest text-black/70 hover:text-black transition-colors">Data</a>
          <a href="#how-it-works" className="f1-h text-xs font-bold uppercase tracking-widest text-black/70 hover:text-black transition-colors">SysReq</a>
          <Link href="/pricing" className="f1-h text-xs font-bold uppercase tracking-widest text-black/70 hover:text-black transition-colors">License</Link>
          <div className="ml-2 pl-4 border-l border-black/30 shadow-[inset_1px_0_0_rgba(255,255,255,0.3)] h-6 flex items-center">
            <WalletMultiButton />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20">
        <div className="animate-slide-up max-w-4xl mx-auto flex flex-col items-center">
          
          <div className="mt-8"></div>

          <h1 className="f1-h text-5xl sm:text-7xl lg:text-8xl font-bold leading-none tracking-tight text-black mb-6 uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
            The Mixpanel<br/>for Solana
          </h1>

          <p className="f1-m text-lg sm:text-xl font-medium text-black/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            On-chain product analytics that tells you exactly what is broken and what to fix. Paste program ID. Compile insights in 30s.
          </p>

          <div className="flex flex-col items-center gap-4">
            <div className="plate p-2">
              {!connected ? (
                <WalletMultiButton />
              ) : (
                <button onClick={handleGetStarted} className="btn-hero">
                  <span className="btn-label flex items-center gap-2"><span className="status-dot"></span> Initiate Scan</span>
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2 mt-4">
              <div className="w-1.5 h-1.5 bg-black/40 rounded-full shadow-[0_1px_0_rgba(255,255,255,0.5)]"></div>
              <span className="f1-m text-[10px] uppercase tracking-widest text-black/60">
                Auth via Wallet Protocol
              </span>
              <div className="w-1.5 h-1.5 bg-black/40 rounded-full shadow-[0_1px_0_rgba(255,255,255,0.5)]"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Hardware Panel - Features */}
      <div id="features" className="relative z-10 px-6 sm:px-12 pb-24 max-w-6xl mx-auto">
        <div className="plate p-8 mb-24">


          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-black/5 rounded-sm border border-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.5)]">
              <div className="w-10 h-10 bg-gradient-to-b from-[#555] to-[#222] rounded-sm mb-4 flex items-center justify-center border border-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                <svg className="w-5 h-5 stroke-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/>
                </svg>
              </div>
              <h3 className="f1-h text-lg font-bold uppercase mb-2 text-black/80">Metrics</h3>
              <p className="f1-m text-xs text-black/60 leading-relaxed">DAW, retention cohorts, funnel drop-off computed from chain tx history. Hard data.</p>
            </div>

            <div className="p-4 bg-black/5 rounded-sm border border-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.5)]">
              <div className="w-10 h-10 bg-gradient-to-b from-[#555] to-[#222] rounded-sm mb-4 flex items-center justify-center border border-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                <svg className="w-5 h-5 stroke-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5"/><path d="M7 12a5 5 0 0 0 5 5"/><path d="M3 21l4.5-4.5M21 3l-4.5 4.5"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <h3 className="f1-h text-lg font-bold uppercase mb-2 text-black/80">AI Insights</h3>
              <p className="f1-m text-xs text-black/60 leading-relaxed">LangGraph pipeline directs repair operations. Specific numbers and prescribed actions.</p>
            </div>

            <div className="p-4 bg-black/5 rounded-sm border border-black/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.5)]">
              <div className="w-10 h-10 bg-gradient-to-b from-[#555] to-[#222] rounded-sm mb-4 flex items-center justify-center border border-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                <svg className="w-5 h-5 stroke-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <h3 className="f1-h text-lg font-bold uppercase mb-2 text-black/80">Native</h3>
              <p className="f1-m text-xs text-black/60 leading-relaxed">Wallet auth, USDC protocols. Built exclusively for on-chain architecture.</p>
            </div>
          </div>
        </div>

        {/* How It Works - Step sequence */}
        <div id="how-it-works" className="mb-24">
          <div className="flex items-center gap-4 mb-10">
            <span className="status-dot"></span>
            <h2 className="f1-h text-sm uppercase tracking-widest font-bold text-black/70">Execution Sequence</h2>
            <div className="flex-1 h-px bg-black/20 shadow-[0_1px_0_rgba(255,255,255,0.3)]"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="plate p-6 text-center group hover:-translate-y-1 transition-transform">
              <div className="w-12 h-12 bg-black/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-black/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_1px_0_rgba(255,255,255,0.5)]">
                <span className="f1-h text-xl font-bold text-black/80">1</span>
              </div>
              <h4 className="f1-h text-lg font-bold uppercase mb-2 text-black/80">Connect</h4>
              <p className="f1-m text-[10px] text-black/60 uppercase tracking-widest">Initialize via Solana wallet. No external auth required.</p>
            </div>
            
            <div className="plate p-6 text-center group hover:-translate-y-1 transition-transform delay-100">
              <div className="w-12 h-12 bg-black/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-black/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_1px_0_rgba(255,255,255,0.5)]">
                <span className="f1-h text-xl font-bold text-black/80">2</span>
              </div>
              <h4 className="f1-h text-lg font-bold uppercase mb-2 text-black/80">Input ID</h4>
              <p className="f1-m text-[10px] text-black/60 uppercase tracking-widest">Paste program address. We index the transaction graph.</p>
            </div>

            <div className="plate p-6 text-center group hover:-translate-y-1 transition-transform delay-200">
              <div className="w-12 h-12 bg-black/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-black/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_1px_0_rgba(255,255,255,0.5)]">
                <span className="f1-h text-xl font-bold text-black/80">3</span>
              </div>
              <h4 className="f1-h text-lg font-bold uppercase mb-2 text-black/80">Analyze</h4>
              <p className="f1-m text-[10px] text-black/60 uppercase tracking-widest">LangGraph outputs retention and churn vectors.</p>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="plate p-12 text-center relative overflow-hidden">
          {/* subtle moving light effect across the plate */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmerSlide_3s_infinite]"></div>

          <h3 className="f1-h text-3xl font-bold uppercase mb-4 text-black/90">Deploy Pulse Analytics</h3>
          <p className="f1-m text-[10px] uppercase tracking-widest text-black/60 mb-8 max-w-md mx-auto">
            Join 500+ programs optimizing their metrics.
          </p>
          <div className="inline-block relative z-10">
            <WalletMultiButton />
          </div>
        </div>
      </div>

      {/* Footer (Bottom Rail) */}
      <footer className="relative z-10 machined-panel border-t border-black/30 shadow-[0_-1px_0_rgba(255,255,255,0.5)] pt-8 pb-4 px-8 mt-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-sm bg-[#222] flex items-center justify-center border border-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
              <span className="text-[#fff] text-[10px] font-mono font-bold">P</span>
            </div>
            <span className="f1-h text-xs font-bold uppercase tracking-widest text-black/80">Pulse Sys.</span>
          </div>
          
          <div className="flex items-center gap-6">
            <a href="#" className="f1-m text-[10px] uppercase tracking-widest text-black/50 hover:text-black transition-colors">Privacy</a>
            <a href="#" className="f1-m text-[10px] uppercase tracking-widest text-black/50 hover:text-black transition-colors">Terms</a>
            <a href="#" className="f1-m text-[10px] uppercase tracking-widest text-black/50 hover:text-black transition-colors">Docs</a>
            <span className="f1-m text-[10px] uppercase tracking-widest text-black/30">V 1.0.4</span>
          </div>
        </div>
      </footer>
    </div>
  )
}