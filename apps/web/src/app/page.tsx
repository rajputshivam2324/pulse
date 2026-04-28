'use client'

/**
 * Pulse Landing Page
 * Clean, dark, premium — "Connect Wallet" is the only CTA.
 */

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LandingPage() {
  const { connected } = useWallet()
  const router = useRouter()

  useEffect(() => {
    if (connected) {
      router.push('/onboarding')
    }
  }, [connected, router])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}>
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <span className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Pulse</span>
        </div>
        <WalletMultiButton />
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="animate-slide-up max-w-3xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8"
            style={{
              background: 'var(--color-brand-subtle)',
              color: 'var(--color-brand-light)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Built for Colosseum Frontier Hackathon
          </div>

          {/* Headline */}
          <h1
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight tracking-tight mb-6"
            style={{ color: 'var(--color-text-primary)' }}
          >
            The{' '}
            <span className="text-gradient">Mixpanel</span>
            {' '}for
            <br />
            Solana Founders
          </h1>

          {/* Subhead */}
          <p
            className="text-lg sm:text-xl max-w-xl mx-auto mb-10 leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            AI-powered product analytics that tells you exactly{' '}
            <span style={{ color: 'var(--color-text-primary)' }}>what&apos;s broken</span>{' '}
            and{' '}
            <span style={{ color: 'var(--color-text-primary)' }}>what to fix</span>.
            Paste your program address. Get insights in 30 seconds.
          </p>

          {/* CTA */}
          <div className="flex flex-col items-center gap-4">
            <WalletMultiButton />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              No email. No password. Just your Solana wallet.
            </p>
          </div>
        </div>

        {/* Feature grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto mt-24"
          style={{ animationDelay: '0.3s' }}
        >
          {[
            {
              icon: '📊',
              title: 'Product Metrics',
              desc: 'DAW, retention cohorts, funnel drop-off — computed from on-chain tx history',
            },
            {
              icon: '🤖',
              title: 'AI Insights',
              desc: 'LangGraph pipeline tells you what to fix — with specific numbers and actions',
            },
            {
              icon: '⚡',
              title: 'Solana-Native',
              desc: 'Wallet auth, USDC payments, on-chain subscriptions. No Stripe, no email.',
            },
          ].map((feature) => (
            <div key={feature.title} className="card animate-fade-in text-left">
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3
                className="font-semibold text-base mb-2"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {feature.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Competitive table */}
        <div className="max-w-2xl mx-auto mt-24 mb-16 w-full animate-fade-in">
          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Why Pulse?
          </h2>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--color-bg-elevated)' }}>
                  <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Platform</th>
                  <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>For</th>
                  <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Focus</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <td className="px-5 py-3" style={{ color: 'var(--color-text-muted)' }}>Pine Analytics</td>
                  <td className="px-5 py-3" style={{ color: 'var(--color-text-muted)' }}>Researchers</td>
                  <td className="px-5 py-3" style={{ color: 'var(--color-text-muted)' }}>Chain-wide charts</td>
                </tr>
                <tr style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <td className="px-5 py-3" style={{ color: 'var(--color-text-muted)' }}>Ionic</td>
                  <td className="px-5 py-3" style={{ color: 'var(--color-text-muted)' }}>Engineers</td>
                  <td className="px-5 py-3" style={{ color: 'var(--color-text-muted)' }}>Raw data API</td>
                </tr>
                <tr
                  style={{
                    borderTop: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-brand-subtle)',
                  }}
                >
                  <td className="px-5 py-3 font-semibold text-gradient">Pulse</td>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>Founders</td>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    Your app, your users, what to fix
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs" style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border-subtle)' }}>
        Built with LangGraph + Helius + Anchor on Solana
      </footer>
    </div>
  )
}
