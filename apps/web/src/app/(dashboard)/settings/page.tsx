'use client'

/**
 * Settings Page — Billing, plan, programs, account management.
 */

import { usePulseStore } from '@/store'
import { PLAN_LIMITS, type PlanType } from '@/lib/plans'
import { useWallet } from '@solana/wallet-adapter-react'

export default function SettingsPage() {
  const { user, programs } = usePulseStore()
  const { publicKey, disconnect } = useWallet()

  const currentPlan = PLAN_LIMITS[user.plan as PlanType] || PLAN_LIMITS.free

  const plans = [
    { key: 'free', ...PLAN_LIMITS.free },
    { key: 'team', ...PLAN_LIMITS.team },
    { key: 'protocol', ...PLAN_LIMITS.protocol },
  ]

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <header className="glass px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Settings
        </h1>
        <a href="/onboarding" className="text-xs" style={{ color: 'var(--color-brand-light)' }}>
          ← Dashboard
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Account */}
        <section>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Account
          </h2>
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Wallet
              </span>
              <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                {publicKey?.toBase58() || user.wallet || 'Not connected'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Current Plan
              </span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--color-brand-subtle)', color: 'var(--color-brand-light)' }}
              >
                {currentPlan.label}
              </span>
            </div>
            <div className="pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <button
                onClick={() => disconnect()}
                className="text-xs font-medium"
                style={{ color: 'var(--color-danger)' }}
              >
                Disconnect Wallet
              </button>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Plans
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isActive = user.plan === plan.key
              return (
                <div
                  key={plan.key}
                  className="card p-5 flex flex-col"
                  style={isActive ? { borderColor: 'var(--color-brand)', boxShadow: '0 0 0 1px rgba(139, 92, 246, 0.3)' } : {}}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {plan.label}
                    </h3>
                    {isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-success-subtle)', color: '#86efac' }}>
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                    {plan.price === 0 ? 'Free' : `$${plan.price}`}
                    {plan.price > 0 && (
                      <span className="text-xs font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>
                        /mo USDC
                      </span>
                    )}
                  </p>
                  <ul className="space-y-2 text-xs flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                    <li>✓ {plan.max_programs === -1 ? 'Unlimited' : plan.max_programs} program{plan.max_programs !== 1 ? 's' : ''}</li>
                    <li>✓ {plan.max_wallets === -1 ? 'Unlimited' : `${(plan.max_wallets).toLocaleString()}`} wallets</li>
                    <li>{plan.ai_insights ? '✓' : '✗'} AI Insights</li>
                    <li>{plan.retention ? '✓' : '✗'} Retention Analysis</li>
                    <li>{plan.funnel ? '✓' : '✗'} Funnel Analytics</li>
                  </ul>
                  {!isActive && plan.price > 0 && (
                    <button className="btn-primary w-full text-xs mt-4">
                      Pay with Solana Pay
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
