'use client'

/**
 * Settings Page — Exact Metallic Silver Design System
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
    <div className="min-h-screen relative overflow-hidden">
      
      <header className="fixed top-0 left-0 right-0 z-50 machined-panel px-6 py-3 flex items-center justify-between">
        <h1 className="text-sm f1-h font-bold text-black/80 uppercase tracking-widest">
          Sys. Settings
        </h1>
        <a 
          href="/onboarding" 
          className="f1-m text-[10px] uppercase tracking-widest text-black/60 flex items-center gap-2 hover:text-black transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Return to Dashboard
        </a>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-8 space-y-12 pt-24 pb-20">
        
        {/* Account Section */}
        <section>
          <div className="page-header text-left flex flex-col items-start mb-6 border-none pb-0">
            <div className="page-title flex items-center gap-2"><span className="status-dot"></span> Account Configuration</div>
          </div>
          
          <div className="plate p-6 space-y-2">
            
            <div className="data-row">
              <span className="data-key">Protocol ID</span>
              <span className="data-val data-mono">
                {publicKey?.toBase58() || user.wallet || 'UNLINKED'}
              </span>
            </div>
            
            <div className="data-row">
              <span className="data-key">Active License</span>
              <span className="data-val">
                <span className="tag">{currentPlan.label}</span>
              </span>
            </div>
            
            {programs.length > 0 && (
              <div className="data-row border-b-0">
                <span className="data-key">Registered Modules</span>
                <span className="data-val data-mono">
                  {programs.length} Active
                </span>
              </div>
            )}
            
            <div className="divider mt-6 mb-4"></div>

            <div className="relative z-10 flex justify-end">
              <button
                onClick={() => disconnect()}
                className="f1-m text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 text-red-600 hover:text-red-800 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sever Connection
              </button>
            </div>
          </div>
        </section>

        {/* Plans Section */}
        <section>
          <div className="page-header text-left flex flex-col items-start mb-6 border-none pb-0 mt-12">
            <div className="page-title flex items-center gap-2"><span className="status-dot"></span> License Upgrade</div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isActive = user.plan === plan.key
              return (
                <div
                  key={plan.key}
                  className="plate p-0 flex flex-col relative overflow-hidden"
                >
                  <div className="badge-row mb-4">
                    <div className="badge">
                      <div className="badge-label">{plan.label}</div>
                    </div>
                    {isActive && <div className="rec-tag best">Active</div>}
                  </div>
                  
                  <div className="px-6 pb-6 flex flex-col flex-1">
                    <p className="relative z-10 text-3xl f1-h font-bold mb-2 text-black/80 tracking-tighter uppercase">
                      {plan.price === 0 ? 'Free' : `$${plan.price}`}
                      {plan.price > 0 && (
                        <span className="text-[10px] f1-m tracking-widest text-black/40 ml-1 align-middle">
                          /MO
                        </span>
                      )}
                    </p>
                    
                    <ul className="relative z-10 space-y-3 text-[10px] f1-m uppercase tracking-widest flex-1 mt-4 mb-6 text-black/60 font-bold">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.5)]"></span>
                        {plan.max_programs === -1 ? 'Unlimited' : plan.max_programs} target{plan.max_programs !== 1 ? 's' : ''}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.5)]"></span>
                        {plan.max_wallets === -1 ? 'Unlimited' : `${(plan.max_wallets).toLocaleString()}`} addresses
                      </li>
                      <li className="flex items-center gap-2">
                        <span className={plan.ai_insights ? "w-1.5 h-1.5 rounded-full bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.5)]" : "w-1 h-px bg-black/20 ml-0.5 mr-0.5"}></span>
                        AI Diagnostics
                      </li>
                      <li className="flex items-center gap-2">
                        <span className={plan.retention ? "w-1.5 h-1.5 rounded-full bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.5)]" : "w-1 h-px bg-black/20 ml-0.5 mr-0.5"}></span>
                        Retention Matrix
                      </li>
                      <li className="flex items-center gap-2">
                        <span className={plan.funnel ? "w-1.5 h-1.5 rounded-full bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.5)]" : "w-1 h-px bg-black/20 ml-0.5 mr-0.5"}></span>
                        Funnel Analytics
                      </li>
                    </ul>
                    
                    {!isActive && plan.price > 0 && (
                      <button 
                        onClick={() => setCheckoutPlan(plan.key as 'team' | 'protocol')}
                        className="btn w-full mt-auto relative z-10"
                      >
                        <span className="btn-label">Authorize Payment</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          
          {checkoutPlan && (
            <div className="mt-8 plate p-6">
              <div className="flex items-center justify-between mb-6 relative z-10 border-b border-black/20 pb-3 shadow-[0_1px_0_rgba(255,255,255,0.3)]">
                <h2 className="text-[10px] f1-m font-bold uppercase tracking-widest text-black/80">
                  Secure Checkout Sequence
                </h2>
                <button 
                  onClick={() => setCheckoutPlan(null)}
                  className="text-[10px] f1-m uppercase tracking-widest font-bold text-red-600 hover:text-red-800"
                >
                  Abort
                </button>
              </div>
              <div className="relative z-10">
                <SubscriptionCheckout 
                  plan={checkoutPlan} 
                  userId={user.wallet || 'unknown'} 
                  onSuccess={handleCheckoutSuccess} 
                />
              </div>
            </div>
          )}
        </section>

        {/* Support Section */}
        <section>
          <div className="plate p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative z-10">
              <h2 className="text-[10px] f1-m font-bold uppercase tracking-widest text-black/80 mb-2">
                System Support
              </h2>
              <p className="text-xs f1-m text-black/60">
                Require direct engineer access or custom tier?
              </p>
            </div>
            <a 
              href="#" 
              className="btn relative z-10 shrink-0"
            >
              <span className="btn-label">Open Ticket</span>
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}