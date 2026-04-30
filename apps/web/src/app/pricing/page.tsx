'use client'

import Link from 'next/link'

const PLANS = [
const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For founders just getting started',
    features: [
      '1 program tracked',
      '30-day transaction history',
      'Basic metrics (DAW, retention)',
      'Email support',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Team',
    price: '$99',
    period: 'month',
    description: 'For growing programs',
    features: [
      '5 programs tracked',
      'Full transaction history',
      'All metrics + funnels',
      'AI insights (basic)',
      'Priority support',
    ],
    cta: 'Start Trial',
    popular: true,
  },
  {
    name: 'Protocol',
    price: '$499',
    period: 'month',
    description: 'For teams at scale',
    features: [
      'Unlimited programs',
      'Real-time analytics',
      'Custom integrations',
      'AI insights (full)',
      'Dedicated support',
      'SLA guarantee',
    ],
    cta: 'Contact Us',
    popular: false,
  },
]
]

export default function PricingPage() {
  return (
    <div className="min-h-screen relative" style={{ background: '#FAF7F2' }}>
      <div className="grid-bg"></div>
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>

      <nav className="fixed top-0 left-0 right-0 z-50 glass px-12 py-5 flex items-center justify-between">
        <Link href="/" className="logo flex items-center gap-2.5 no-underline">
          <div className="logo-mark w-8 h-8 bg-[#2C2420] rounded-full flex items-center justify-center text-[#FAF7F2] text-sm font-medium">P</div>
          <span style={{ fontFamily: 'Georgia, serif', letterSpacing: '-0.3px' }} className="font-serif text-xl font-bold text-[#2C2420]">Pulse</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </nav>

      <div className="relative z-10 px-6 py-32 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h1 style={{ fontFamily: 'Georgia, serif' }} className="font-serif text-5xl font-bold text-[#2C2420] mb-4">
            Simple, transparent pricing
          </h1>
          <p style={{ fontFamily: 'Georgia, serif' }} className="text-lg text-[#7A6860]">
            Pay in USDC. Cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`card p-6 ${plan.popular ? 'ring-2 ring-[#B5623E]' : ''}`}
              style={{ 
                background: '#F5EFE6',
                fontFamily: 'Georgia, serif'
              }}
            >
              {plan.popular && (
                <div className="text-xs font-medium text-[#FAF7F2] bg-[#B5623E] px-3 py-1 rounded-full inline-block mb-4">
                  Most Popular
                </div>
              )}
              <h3 style={{ fontFamily: 'Georgia, serif' }} className="font-serif text-xl font-bold text-[#2C2420] mb-2">
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span style={{ fontFamily: 'Georgia, serif' }} className="text-4xl font-bold text-[#2C2420]">
                  {plan.price}
                </span>
                {plan.period && (
                  <span style={{ fontFamily: 'Georgia, serif' }} className="text-sm text-[#7A6860]">
                    /{plan.period}
                  </span>
                )}
              </div>
              <p style={{ fontFamily: 'Georgia, serif' }} className="text-sm text-[#7A6860] mb-6">
                {plan.description}
              </p>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-[#2C2420]">
                    <svg className="w-4 h-4 text-[#B5623E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <button className={`w-full py-3 rounded-lg font-medium ${plan.popular ? 'bg-[#B5623E] text-[#FAF7F2]' : 'bg-[#2C2420] text-[#FAF7F2]'}`}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center mt-12 text-sm text-[#7A6860]" style={{ fontFamily: 'Georgia, serif' }}>
          <p>All plans paid in USDC. Taxes may apply.</p>
        </div>
      </div>
    </div>
  )
}