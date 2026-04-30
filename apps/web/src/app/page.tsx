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
    <div className="min-h-screen relative">
      {/* Grid Background */}
      <div className="grid-bg"></div>
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-12 py-5 glass">
        <Link href="/" className="logo flex items-center gap-2.5 no-underline">
          <div className="logo-mark w-8 h-8 bg-[#2C2420] rounded-full flex items-center justify-center text-[#FAF7F2] text-sm font-medium">P</div>
          <span style={{ fontFamily: 'Georgia, serif', letterSpacing: '-0.3px' }} className="font-serif text-xl font-bold text-[#2C2420]">Pulse</span>
        </Link>
        <div className="flex items-center gap-3">
          <a href="#features" className="btn-ghost">Features</a>
          <a href="#how-it-works" className="btn-ghost">How it Works</a>
          <Link href="/pricing" className="btn-ghost">Pricing</Link>
          <WalletMultiButton />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 py-32">
        <div className="animate-slide-up max-w-4xl mx-auto">
          {/* Badge */}
          <div className="badge inline-flex items-center gap-1.5 mb-9">
            <span className="badge-dot"></span>
            Built for Colosseum Frontier Hackathon
          </div>

          {/* Headline - NOT COMPRESSED */}
          <h1 style={{ fontFamily: 'Georgia, serif', letterSpacing: '-1px' }} className="font-serif text-6xl sm:text-7xl lg:text-8xl font-black leading-tight tracking-tight text-[#2C2420] mb-7">
            The Mixpanel for
            <br />
            <em className="text-[#B5623E]">Solana Founders</em>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl font-light text-[#7A6860] max-w-xl mx-auto mb-12 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
            AI-powered product analytics that tells you exactly <strong className="font-medium text-[#2C2420]">what&apos;s broken</strong> and <strong className="font-medium text-[#2C2420]">what to fix</strong>. Paste your program address. Get insights in 30 seconds.
          </p>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3.5">
            {!connected ? (
              <WalletMultiButton />
            ) : (
              <button onClick={handleGetStarted} className="btn-primary text-lg px-8 py-3">
                Get Started
              </button>
            )}
            <span className="text-sm text-[#A8978E] flex items-center gap-1.5" style={{ fontFamily: 'Georgia, serif' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
              No email. No password. Just your Solana wallet.
            </span>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <div id="features" className="relative z-10 px-12 pb-24 max-w-5xl mx-auto">
        <div className="grid grid-cols-3 gap-5 mb-24">
          <div className="card group">
            <div className="card-icon w-11 h-11 bg-[#F2DACE] rounded-xl flex items-center justify-content-center mb-5">
              <svg className="w-5 h-5 stroke-[#B5623E]" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/>
              </svg>
            </div>
            <h3 className="font-serif text-xl font-bold text-[#2C2420] mb-2.5" style={{ fontFamily: 'Georgia, serif' }}>Product Metrics</h3>
            <p className="text-sm font-light text-[#7A6860] leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>DAW, retention cohorts, funnel drop-off — computed from on-chain tx history. Real data, real decisions.</p>
          </div>

          <div className="card group">
            <div className="card-icon w-11 h-11 bg-[#F2DACE] rounded-xl flex items-center justify-content-center mb-5">
              <svg className="w-5 h-5 stroke-[#B5623E]" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5"/><path d="M7 12a5 5 0 0 0 5 5"/><path d="M3 21l4.5-4.5M21 3l-4.5 4.5"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <h3 className="font-serif text-xl font-bold text-[#2C2420] mb-2.5" style={{ fontFamily: 'Georgia, serif' }}>AI Insights</h3>
            <p className="text-sm font-light text-[#7A6860] leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>LangGraph pipeline tells you what to fix — with specific numbers and actions. Not just dashboards, but direction.</p>
          </div>

          <div className="card group">
            <div className="card-icon w-11 h-11 bg-[#F2DACE] rounded-xl flex items-center justify-content-center mb-5">
              <svg className="w-5 h-5 stroke-[#B5623E]" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <h3 className="font-serif text-xl font-bold text-[#2C2420] mb-2.5" style={{ fontFamily: 'Georgia, serif' }}>Solana-Native</h3>
            <p className="text-sm font-light text-[#7A6860] leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>Wallet auth, USDC payments, on-chain subscriptions. No Stripe, no email. Built for the on-chain world.</p>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="stats-strip">
          <div className="stat-item">
            <div className="stat-num">500+</div>
            <div className="stat-label">Programs Tracked</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">2M+</div>
            <div className="stat-label">Transactions Analyzed</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">12s</div>
            <div className="stat-label">Avg. Sync Time</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">99.9%</div>
            <div className="stat-label">Uptime</div>
          </div>
        </div>

        {/* How It Works */}
        <div id="how-it-works" className="mb-16">
          <div className="section-label">How It Works</div>
          <div className="section-title">Get insights in 3 simple steps</div>

          <div className="grid grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#F2DACE] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="font-serif text-2xl font-bold text-[#B5623E]" style={{ fontFamily: 'Georgia, serif' }}>1</span>
              </div>
              <h4 className="font-serif text-lg font-bold text-[#2C2420] mb-2" style={{ fontFamily: 'Georgia, serif' }}>Connect Wallet</h4>
              <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>Link your Solana wallet. No sign-up, no email. Just connect and go.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#F2DACE] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="font-serif text-2xl font-bold text-[#B5623E]" style={{ fontFamily: 'Georgia, serif' }}>2</span>
              </div>
              <h4 className="font-serif text-lg font-bold text-[#2C2420] mb-2" style={{ fontFamily: 'Georgia, serif' }}>Paste Program Address</h4>
              <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>Enter your Solana program ID. We fetch your entire on-chain transaction history.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#F2DACE] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="font-serif text-2xl font-bold text-[#B5623E]" style={{ fontFamily: 'Georgia, serif' }}>3</span>
              </div>
              <h4 className="font-serif text-lg font-bold text-[#2C2420] mb-2" style={{ fontFamily: 'Georgia, serif' }}>Get AI Insights</h4>
              <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>LangGraph analyzes retention, churn, and growth. You get specific actions to improve.</p>
            </div>
          </div>
        </div>

        {/* Why Pulse - Better Points Without Comparison */}
        <div className="mb-16">
          <div className="section-label">Why Pulse</div>
          <div className="section-title">Analytics that actually helps</div>

          <div className="grid grid-cols-2 gap-6">
            <div className="card" style={{ background: '#F5EFE6' }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#F2DACE] rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#B5623E' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.167 12a4.5 4.5 0 00-3.09 3.09L.167 18.75M9.813 15.904l.846 2.846a4.5 4.5 0 003.09 3.09L18.75 21M9.813 15.904l-8.626-8.626M18.75 4.5l-8.626 8.626" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-serif text-base font-bold text-[#2C2420] mb-1" style={{ fontFamily: 'Georgia, serif' }}>AI-Powered Recommendations</h4>
                  <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>Not just data visualizations — our LangGraph pipeline produces actionable recommendations tailored to your specific program.</p>
                </div>
              </div>
            </div>

            <div className="card" style={{ background: '#F5EFE6' }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#F2DACE] rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#B5623E' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-serif text-base font-bold text-[#2C2420] mb-1" style={{ fontFamily: 'Georgia, serif' }}>No Monthly Fees</h4>
                  <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>Free tier handles most programs. Upgrade only when you need AI insights. Pay in USDC, on-chain.</p>
                </div>
              </div>
            </div>

            <div className="card" style={{ background: '#F5EFE6' }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#F2DACE] rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#B5623E' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-serif text-base font-bold text-[#2C2420] mb-1" style={{ fontFamily: 'Georgia, serif' }}>Seconds, Not Days</h4>
                  <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>Sync your entire transaction history in under 30 seconds. Instant insights after sync completes.</p>
                </div>
              </div>
            </div>

            <div className="card" style={{ background: '#F5EFE6' }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#F2DACE] rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ stroke: '#B5623E' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-serif text-base font-bold text-[#2C2420] mb-1" style={{ fontFamily: 'Georgia, serif' }}>Your Data Stays Yours</h4>
                  <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>We never sell your data. Analytics are private to your program. Built for builders, by builders.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="card text-center p-12" style={{ background: '#F5EFE6' }}>
          <h3 className="font-serif text-3xl font-bold text-[#2C2420] mb-4" style={{ fontFamily: 'Georgia, serif' }}>Ready to understand your users?</h3>
          <p className="text-lg text-[#7A6860] mb-8 max-w-md mx-auto" style={{ fontFamily: 'Georgia, serif' }}>Join 500+ Solana programs already using Pulse to build better products.</p>
          <WalletMultiButton />
        </div>
      </div>

      {/* Professional Footer */}
      <footer className="relative z-10 bg-[#2C2420] text-[#A8978E] py-16 px-12">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-4 gap-8 mb-12">
            {/* Brand Column */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-[#FAF7F2] rounded-full flex items-center justify-center">
                  <span className="text-[#2C2420] font-serif font-bold text-sm">P</span>
                </div>
                <span className="font-serif text-lg font-bold text-[#FAF7F2]" style={{ fontFamily: 'Georgia, serif' }}>Pulse</span>
              </div>
              <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>
                AI-powered analytics for Solana founders. Build better products with data-driven insights.
              </p>
            </div>

            {/* Product Column */}
            <div>
              <h4 className="font-serif text-sm font-bold text-[#FAF7F2] mb-4" style={{ fontFamily: 'Georgia, serif' }}>Product</h4>
              <ul className="space-y-2 text-sm" style={{ fontFamily: 'Georgia, serif' }}>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Integration</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">API</a></li>
              </ul>
            </div>

            {/* Developers Column */}
            <div>
              <h4 className="font-serif text-sm font-bold text-[#FAF7F2] mb-4" style={{ fontFamily: 'Georgia, serif' }}>Developers</h4>
              <ul className="space-y-2 text-sm" style={{ fontFamily: 'Georgia, serif' }}>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Examples</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Status</a></li>
              </ul>
            </div>

            {/* Company Column */}
            <div>
              <h4 className="font-serif text-sm font-bold text-[#FAF7F2] mb-4" style={{ fontFamily: 'Georgia, serif' }}>Company</h4>
              <ul className="space-y-2 text-sm" style={{ fontFamily: 'Georgia, serif' }}>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">About</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-[#FAF7F2] transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Footer */}
          <div className="pt-8 border-t border-[#3D352F] flex items-center justify-between">
            <p className="text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>
              &copy; 2025 Pulse. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm hover:text-[#FAF7F2] transition-colors" style={{ fontFamily: 'Georgia, serif' }}>Privacy Policy</a>
              <a href="#" className="text-sm hover:text-[#FAF7F2] transition-colors" style={{ fontFamily: 'Georgia, serif' }}>Terms of Service</a>
              <a href="#" className="text-sm hover:text-[#FAF7F2] transition-colors" style={{ fontFamily: 'Georgia, serif' }}>Twitter</a>
              <a href="#" className="text-sm hover:text-[#FAF7F2] transition-colors" style={{ fontFamily: 'Georgia, serif' }}>GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}