'use client'

/**
 * Settings Page — Premium Warm Design
 * Cream / Rose / Charcoal Palette
 */

import { usePulseStore } from '@/store'
import { PLAN_LIMITS, type PlanType } from '@/lib/plans'
import { useWallet } from '@solana/wallet-adapter-react'
import { useState } from 'react'
import { SubscriptionCheckout } from '@/components/dashboard/SubscriptionCheckout'

export default function SettingsPage() {
  const { user, programs, setUser } = usePulseStore()
  const { publicKey, disconnect } = useWallet()
  const [checkoutPlan, setCheckoutPlan] = useState<'team' | 'protocol' | null>(null)

  const handleCheckoutSuccess = (signature: string) => {
    // In production, backend would verify the signature and update the plan.
    // For demo, just update local state.
    if (checkoutPlan) {
      setUser({ plan: checkoutPlan })
      setCheckoutPlan(null)
    }
  }

  const currentPlan = PLAN_LIMITS[user.plan as PlanType] || PLAN_LIMITS.free

  const plans = [
    { key: 'free', ...PLAN_LIMITS.free },
    { key: 'team', ...PLAN_LIMITS.team },
    { key: 'protocol', ...PLAN_LIMITS.protocol },
  ]

  return (
    <div className="min-h-screen relative">
      {/* Grid Background */}
      <div className="grid-bg"></div>

      <header className="fixed top-0 left-0 right-0 z-50 glass px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-serif font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
          Settings
        </h1>
        <a 
          href="/onboarding" 
          className="text-sm flex items-center gap-2 hover:opacity-80 transition-opacity"
          style={{ color: '#7A6860' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </a>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-6 py-8 space-y-8 pt-24">
        {/* Account Section */}
        <section>
          <h2 className="text-sm font-serif font-semibold mb-4" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
            Account
          </h2>
          <div className="card p-5 space-y-4" style={{ background: '#F5EFE6' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#7A6860' }}>Wallet</span>
              <span className="text-xs font-mono" style={{ color: '#2C2420' }}>
                {publicKey?.toBase58() || user.wallet || 'Not connected'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#7A6860' }}>Current Plan</span>
              <span
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{ background: '#F2DACE', color: '#8C4A2C' }}
              >
                {currentPlan.label}
              </span>
            </div>
            {programs.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#7A6860' }}>Programs</span>
                <span className="text-xs" style={{ color: '#2C2420' }}>
                  {programs.length} added
                </span>
              </div>
            )}
            <div className="pt-4" style={{ borderTop: '1px solid rgba(180,140,120,0.2)' }}>
              <button
                onClick={() => disconnect()}
                className="text-xs font-medium flex items-center gap-2"
                style={{ color: '#B5623E' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect Wallet
              </button>
            </div>
          </div>
        </section>

        {/* Plans Section */}
        <section>
          <h2 className="text-sm font-serif font-semibold mb-4" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
            Plans
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isActive = user.plan === plan.key
              return (
                <div
                  key={plan.key}
                  className="card p-5 flex flex-col"
                  style={isActive ? { 
                    borderColor: '#D4825A', 
                    boxShadow: '0 0 20px rgba(212,130,90,0.2)',
                    background: '#F5EFE6',
                  } : { background: '#F5EFE6' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-serif font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
                      {plan.label}
                    </h3>
                    {isActive && (
                      <span 
                        className="text-xs font-medium px-2 py-0.5 rounded-full" 
                        style={{ background: '#F2DACE', color: '#8C4A2C' }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-3xl font-serif font-bold mb-1" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
                    {plan.price === 0 ? 'Free' : `$${plan.price}`}
                    {plan.price > 0 && (
                      <span className="text-xs font-normal ml-1" style={{ color: '#7A6860' }}>
                        /mo
                      </span>
                    )}
                  </p>
                  <ul className="space-y-2.5 text-xs flex-1 mt-2 mb-4" style={{ color: '#7A6860' }}>
                    <li className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {plan.max_programs === -1 ? 'Unlimited' : plan.max_programs} program{plan.max_programs !== 1 ? 's' : ''}
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {plan.max_wallets === -1 ? 'Unlimited' : `${(plan.max_wallets).toLocaleString()}`} wallets
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={plan.ai_insights ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                      </svg>
                      AI Insights
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={plan.retention ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                      </svg>
                      Retention Analysis
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={plan.funnel ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                      </svg>
                      Funnel Analytics
                    </li>
                  </ul>
                  {!isActive && plan.price > 0 && (
                    <button 
                      onClick={() => setCheckoutPlan(plan.key as 'team' | 'protocol')}
                      className="btn-primary w-full text-xs mt-auto"
                    >
                      Pay with USDC
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          
          {checkoutPlan && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-serif font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
                  Checkout
                </h2>
                <button 
                  onClick={() => setCheckoutPlan(null)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Cancel
                </button>
              </div>
              <SubscriptionCheckout 
                plan={checkoutPlan} 
                userId={user.wallet || 'unknown'} 
                onSuccess={handleCheckoutSuccess} 
              />
            </div>
          )}
        </section>

        {/* Help / Contact */}
        <section>
          <h2 className="text-sm font-serif font-semibold mb-4" style={{ fontFamily: 'Georgia, serif', color: '#2C2420' }}>
            Need Help?
          </h2>
          <div className="card p-5" style={{ background: '#F5EFE6' }}>
            <p className="text-sm mb-4" style={{ color: '#7A6860' }}>
              Have questions or need enterprise features? Reach out to the team.
            </p>
            <a 
              href="#" 
              className="btn-ghost text-xs inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Contact Us
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}