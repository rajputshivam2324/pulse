'use client'

/**
 * Account Page — Enterprise subscription hub.
 * Like Claude/ChatGPT: one place for plan, usage, billing history, upgrade.
 * Plan is always fetched live from /user/me — never trusted from local state alone.
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePulseStore } from '@/store'
import { PLAN_LIMITS, type PlanType } from '@/lib/plans'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET || ''
// Safe-by-default: demo mode must be explicitly opted in.
const DEMO_BILLING = process.env.NEXT_PUBLIC_DEMO_BILLING === 'true'

interface UserProfile {
  wallet_pubkey: string
  plan: string
  plan_expires_at: string | null
  member_since: string | null
  usage: { programs_registered: number; total_transactions_indexed: number }
  programs: { id: string; name: string | null; program_address: string; last_synced_at: string | null }[]
  payment_history: { plan: string; amount_usdc: number; paid_at: string; tx_signature: string }[]
  linked_wallets?: string[]
}

const PLAN_PRICES: Record<string, number> = { team: 99, protocol: 499 }

export default function AccountPage() {
  const router = useRouter()
  const { user, setUser, setIsLinkingWallet, isLinkingWallet, setLinkedWallets } = usePulseStore()
  const { publicKey, sendTransaction, signMessage } = useWallet()
  const { connection } = useConnection()
  const { setVisible } = useWalletModal()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<'team' | 'protocol' | null>(null)
  const [payStatus, setPayStatus] = useState<'idle' | 'processing' | 'confirmed' | 'error'>('idle')
  const [payError, setPayError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'billing' | 'programs'>('overview')

  const [linkStatus, setLinkStatus] = useState<'idle' | 'linking' | 'success' | 'error'>('idle')
  const [linkError, setLinkError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!user.token) { router.replace('/connect'); return }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/user/me`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.ok) {
        const data: UserProfile = await res.json()
        setProfile(data)
        // Sync live plan back into store
        if (data.plan !== user.plan) {
          setUser({ plan: data.plan })
          if (typeof window !== 'undefined') {
            localStorage.setItem('pulse_plan', data.plan)
          }
        }
        // Sync linked wallets into store for AuthGuard
        if (data.linked_wallets) {
          setLinkedWallets(data.linked_wallets)
        }
      } else if (res.status === 401) {
        router.replace('/connect')
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [user.token, user.plan, setUser, setLinkedWallets, router])

  useEffect(() => { void fetchProfile() }, [fetchProfile])

  async function handleUpgrade(plan: 'team' | 'protocol') {
    if (!user.token) return
    setSelectedPlan(plan)
    setPayStatus('processing')
    setPayError(null)

    try {
      let txSignature = `demo_${Date.now()}`
      let amountUsdc = PLAN_PRICES[plan]

      if (!DEMO_BILLING && publicKey && TREASURY) {
        // Real Solana Pay flow
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(TREASURY),
            lamports: Math.round(0.01 * LAMPORTS_PER_SOL), // demo amount
          })
        )
        txSignature = await sendTransaction(tx, connection)
        await connection.confirmTransaction(txSignature, 'confirmed')
      }

      // Tell backend to record payment + upgrade plan server-side
      const res = await fetch(`${API_BASE}/billing/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ plan, tx_signature: txSignature, amount_usdc: amountUsdc }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Upgrade failed')
      }

      setPayStatus('confirmed')
      setUser({ plan })
      if (typeof window !== 'undefined') localStorage.setItem('pulse_plan', plan)
      // Refresh profile to show new plan data
      setTimeout(() => { void fetchProfile(); setPayStatus('idle') }, 2000)
    } catch (e) {
      setPayStatus('error')
      setPayError(e instanceof Error ? e.message : 'Upgrade failed')
    }
  }

  async function handleLinkWallet() {
    if (!user.token || !publicKey || !signMessage) return
    
    // Check if the current wallet is already linked or primary
    if (publicKey.toBase58() === user.wallet || profile?.linked_wallets?.includes(publicKey.toBase58())) {
      setLinkError('This wallet is already connected to your account')
      setLinkStatus('error')
      setIsLinkingWallet(false)
      return
    }

    setLinkStatus('linking')
    setLinkError(null)

    try {
      // 1. Get nonce (POST with wallet in body — nonce route requires it)
      const nonceRes = await fetch('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      })
      if (!nonceRes.ok) throw new Error('Failed to get nonce')
      const { nonce } = await nonceRes.json()

      // 2. Sign message binding user.wallet to new wallet via nonce
      // Ensure this matches the exact message constructed on backend
      const message = new TextEncoder().encode(
        `Sign to link wallet to Pulse\n\nUser ID: ${profile?.wallet_pubkey || user.wallet}\nWallet: ${publicKey.toBase58()}\nNonce: ${nonce}\n\nThis will not trigger any blockchain transaction.`
      )
      
      const signatureArray = await signMessage(message)
      const signature = Array.from(signatureArray)

      // 3. Send link request to our API (we use the Next.js API for auth/link)
      const res = await fetch('/api/auth/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          signature,
          nonce
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to link wallet')
      }

      setLinkStatus('success')
      setIsLinkingWallet(false)
      setTimeout(() => { void fetchProfile(); setLinkStatus('idle') }, 2000)

    } catch (e) {
      setLinkStatus('error')
      setLinkError(e instanceof Error ? e.message : 'Wallet linking failed')
      setIsLinkingWallet(false)
    }
  }

  async function handleUnlinkWallet(walletToUnlink: string) {
    if (!user.token) return
    if (!confirm('Are you sure you want to remove this wallet? It will lose access to your account.')) return

    try {
      const res = await fetch('/api/auth/unlink', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ wallet_to_unlink: walletToUnlink }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to unlink wallet')
      }

      // Refresh profile to reflect unlinked wallet
      void fetchProfile()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to unlink wallet')
    }
  }

  const startLinkingFlow = () => {
    setIsLinkingWallet(true)
    setVisible(true) // Automatically pop up the wallet selection modal!
  }

  const cancelLinkingFlow = () => {
    setIsLinkingWallet(false)
    setLinkStatus('idle')
    setLinkError(null)
  }

  const plans = [
    { key: 'free', ...PLAN_LIMITS.free },
    { key: 'team', ...PLAN_LIMITS.team },
    { key: 'protocol', ...PLAN_LIMITS.protocol },
  ] as const

  const currentPlan = PLAN_LIMITS[(profile?.plan || user.plan) as PlanType] || PLAN_LIMITS.free
  const activePlanKey = profile?.plan || user.plan || 'free'

  const truncate = (s: string, n = 8) =>
    s.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-4)}` : s

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-black/40">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
          </svg>
          <span className="text-[10px] f1-m uppercase tracking-widest">Loading account…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">

      {/* Top Rail */}
      <header className="fixed top-0 left-0 right-0 z-50 machined-panel px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 f1-m text-[10px] uppercase tracking-widest text-black/60 hover:text-black transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          <div className="w-px h-6 bg-black/20 shadow-[1px_0_0_rgba(255,255,255,0.3)]" />
          <h1 className="text-sm f1-h font-bold text-black/80 uppercase tracking-widest">Account</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="tag">{currentPlan.label} Plan</span>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-20 space-y-8">

        {/* Identity strip */}
        <div className="plate p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-sm bg-gradient-to-b from-[#444] to-[#111] flex items-center justify-center border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
              <span className="text-white f1-h font-black text-lg">P</span>
            </div>
            <div>
              <p className="text-[10px] f1-m uppercase tracking-widest text-black/40 mb-1">Wallet ID</p>
              <p className="text-sm f1-h font-bold text-black/80 font-mono">
                {truncate(profile?.wallet_pubkey || user.wallet || '—', 10)}
              </p>
              {profile?.member_since && (
                <p className="text-[9px] f1-m text-black/40 mt-1">
                  Member since {new Date(profile.member_since).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] f1-m font-bold uppercase tracking-widest rounded-sm border ${
              activePlanKey === 'protocol' ? 'border-black/40 bg-black text-white' :
              activePlanKey === 'team' ? 'border-black/30 bg-black/10 text-black/80' :
              'border-black/20 bg-black/5 text-black/50'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${activePlanKey !== 'free' ? 'bg-green-500' : 'bg-black/30'}`} />
              {currentPlan.label} Plan
            </span>
          </div>
        </div>

        {/* Linked Wallets Strip */}
        <div className="plate p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm f1-h font-bold text-black/80 uppercase tracking-widest">Linked Wallets</h2>
            <div className="text-[10px] f1-m text-black/40 uppercase tracking-widest">{profile?.linked_wallets?.length || 0} / 5 Linked</div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-black/5 rounded-sm border border-black/10">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="f1-m text-xs text-black/80 font-mono">{truncate(user.wallet || '', 12)}</span>
              </div>
              <span className="tag">Primary</span>
            </div>

            {profile?.linked_wallets?.map(lw => (
              <div key={lw} className="flex items-center justify-between p-3 bg-black/5 rounded-sm border border-black/10 group">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-black/30" />
                  <span className="f1-m text-xs text-black/80 font-mono">{truncate(lw, 12)}</span>
                  <span className="tag !bg-black/10 !text-black/50 ml-2">Linked</span>
                </div>
                <button 
                  onClick={() => handleUnlinkWallet(lw)}
                  className="text-[10px] f1-m uppercase tracking-widest text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-black/10">
            {isLinkingWallet ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-black/5 border-l-2 border-black/40 rounded-r-sm mb-1">
                  <p className="text-[10px] f1-m uppercase tracking-widest text-black/80 font-bold mb-1">Action Required</p>
                  <p className="text-[10px] f1-m uppercase tracking-widest text-black/50">
                    1. Open your wallet extension (Phantom/Solflare)<br/>
                    2. Switch to the account you want to link<br/>
                    3. Click "Confirm Link" below
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleLinkWallet}
                    disabled={linkStatus === 'linking'}
                    className="btn"
                  >
                    <span className="btn-label">{linkStatus === 'linking' ? 'Verifying...' : 'Confirm Link'}</span>
                  </button>
                  <button onClick={cancelLinkingFlow} className="text-[10px] f1-m uppercase tracking-widest text-black/40 hover:text-black">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={startLinkingFlow} className="btn-ghost" disabled={(profile?.linked_wallets?.length || 0) >= 5}>
                <span className="btn-label">+ Link New Wallet</span>
              </button>
            )}

            {linkStatus === 'error' && linkError && (
               <p className="mt-3 text-[10px] f1-m uppercase tracking-widest text-red-600 font-bold">{linkError}</p>
            )}
            {linkStatus === 'success' && (
               <p className="mt-3 text-[10px] f1-m uppercase tracking-widest text-green-600 font-bold">✓ Wallet successfully linked</p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-black/5 rounded-sm border border-black/10 w-fit shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)]">
          {(['overview', 'billing', 'programs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[10px] f1-m font-bold uppercase tracking-widest transition-all rounded-sm ${
                activeTab === tab
                  ? 'bg-black text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                  : 'text-black/50 hover:text-black/80'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Usage meters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: 'Programs',
                  value: profile?.usage.programs_registered ?? 0,
                  limit: currentPlan.max_programs === -1 ? '∞' : currentPlan.max_programs,
                  pct: currentPlan.max_programs === -1 ? 0 :
                    Math.min(100, ((profile?.usage.programs_registered ?? 0) / currentPlan.max_programs) * 100),
                },
                {
                  label: 'Transactions Indexed',
                  value: (profile?.usage.total_transactions_indexed ?? 0).toLocaleString(),
                  limit: currentPlan.max_wallets === -1 ? '∞' : `${currentPlan.max_wallets.toLocaleString()} wallets`,
                  pct: 0,
                },
                {
                  label: 'AI Diagnostics',
                  value: currentPlan.ai_insights ? 'Enabled' : 'Locked',
                  limit: currentPlan.ai_insights ? 'Full access' : 'Team+ required',
                  pct: currentPlan.ai_insights ? 100 : 0,
                },
              ].map((m) => (
                <div key={m.label} className="plate p-5">
                  <p className="text-[10px] f1-m uppercase tracking-widest text-black/40 mb-2">{m.label}</p>
                  <p className="text-2xl f1-h font-bold text-black/80 mb-1">{m.value}</p>
                  <p className="text-[9px] f1-m text-black/40 mb-3">{m.limit}</p>
                  {typeof m.pct === 'number' && m.pct > 0 && (
                    <div className="h-1 bg-black/10 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]">
                      <div
                        className={`h-full rounded-full transition-all ${m.pct >= 90 ? 'bg-red-500' : 'bg-black/40'}`}
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Feature matrix for current plan */}
            <div className="plate p-6">
              <div className="badge-row -mx-6 -mt-6 mb-6 px-6">
                <div className="badge">
                  <div className="badge-label">Current Plan Features</div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
                {[
                  ['AI Diagnostics', currentPlan.ai_insights],
                  ['Retention Matrix', currentPlan.retention],
                  ['Funnel Analytics', currentPlan.funnel],
                  ['Unlimited Programs', currentPlan.max_programs === -1],
                ].map(([label, enabled]) => (
                  <div key={String(label)} className={`p-3 rounded-sm border text-center ${enabled ? 'border-black/20 bg-black/5' : 'border-black/10 bg-black/[0.02] opacity-50'}`}>
                    <div className={`text-lg mb-1 ${enabled ? '' : 'grayscale'}`}>{enabled ? '✓' : '✗'}</div>
                    <p className="text-[9px] f1-m uppercase tracking-widest text-black/60 font-bold">{String(label)}</p>
                  </div>
                ))}
              </div>
              {activePlanKey === 'free' && (
                <div className="mt-6 pt-4 border-t border-black/10 relative z-10 flex items-center justify-between">
                  <p className="text-xs f1-m text-black/50">Unlock all features with Team or Protocol plan</p>
                  <button
                    onClick={() => setActiveTab('billing')}
                    className="btn text-[10px] uppercase tracking-widest"
                  >
                    <span className="btn-label">View Plans</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BILLING TAB ── */}
        {activeTab === 'billing' && (
          <div className="space-y-8">

            {/* Plan cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const isActive = activePlanKey === plan.key
                const isUpgrade = plan.key !== 'free' && !isActive
                return (
                  <div
                    key={plan.key}
                    className={`plate p-0 flex flex-col relative overflow-hidden transition-transform ${isActive ? 'ring-2 ring-black/20' : ''}`}
                  >
                    <div className="badge-row mb-0">
                      <div className="badge">
                        <div className="badge-label">{plan.label}</div>
                      </div>
                      {isActive && <div className="rec-tag best">Active</div>}
                      {plan.key === 'team' && !isActive && <div className="rec-tag">Popular</div>}
                    </div>

                    <div className="px-6 pb-6 pt-4 flex flex-col flex-1">
                      <p className="text-4xl f1-h font-bold text-black/80 mb-1">
                        {plan.price === 0 ? 'Free' : `$${plan.price}`}
                        {plan.price > 0 && <span className="text-[10px] f1-m text-black/40 ml-1">/mo</span>}
                      </p>

                      <ul className="space-y-2 text-[10px] f1-m uppercase tracking-widest text-black/60 font-bold mt-4 mb-6 flex-1">
                        {[
                          `${plan.max_programs === -1 ? 'Unlimited' : plan.max_programs} program${plan.max_programs !== 1 ? 's' : ''}`,
                          `${plan.max_wallets === -1 ? 'Unlimited' : plan.max_wallets.toLocaleString()} wallets`,
                          plan.ai_insights ? 'AI diagnostics' : null,
                          plan.retention ? 'Retention matrix' : null,
                          plan.funnel ? 'Funnel analytics' : null,
                        ].filter(Boolean).map((f) => (
                          <li key={String(f)} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-black/40" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isActive ? (
                        <div className="text-center py-2">
                          <span className="text-[10px] f1-m text-black/40 uppercase tracking-widest">Current Plan</span>
                        </div>
                      ) : isUpgrade ? (
                        <button
                          onClick={() => handleUpgrade(plan.key as 'team' | 'protocol')}
                          disabled={payStatus === 'processing'}
                          className="btn w-full mt-auto"
                        >
                          <span className="btn-label">
                            {payStatus === 'processing' && selectedPlan === plan.key ? 'Processing…' :
                             payStatus === 'confirmed' && selectedPlan === plan.key ? 'Activated!' :
                             DEMO_BILLING ? `Activate ${plan.label} (Demo)` : `Upgrade — $${plan.price}/mo`}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Payment feedback */}
            {payStatus === 'processing' && (
              <div className="plate p-4 flex items-center gap-3">
                <svg className="animate-spin h-4 w-4 text-black/40" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
                <p className="text-[10px] f1-m uppercase tracking-widest text-black/60">
                  {DEMO_BILLING ? 'Activating plan…' : 'Confirm transaction in your wallet…'}
                </p>
              </div>
            )}
            {payStatus === 'confirmed' && (
              <div className="plate p-4 border-l-4 border-green-500">
                <p className="text-[10px] f1-m uppercase tracking-widest text-green-700 font-bold">
                  ✓ Plan activated! Your account has been upgraded.
                </p>
              </div>
            )}
            {payStatus === 'error' && payError && (
              <div className="plate p-4 border-l-4 border-red-500 flex items-center justify-between">
                <p className="text-[10px] f1-m uppercase tracking-widest text-red-700 font-bold">{payError}</p>
                <button onClick={() => setPayStatus('idle')} className="text-red-400 hover:text-red-600 text-[10px]">✕</button>
              </div>
            )}

            {DEMO_BILLING && (
              <div className="plate p-4 border-l-4 border-yellow-400">
                <p className="text-[10px] f1-m uppercase tracking-widest text-yellow-700">
                  ⚠ Demo mode — upgrades activate instantly without real payment.
                  Set <code className="font-mono">DEMO_BILLING=false</code> + <code className="font-mono">NEXT_PUBLIC_TREASURY_WALLET</code> for production Solana Pay.
                </p>
              </div>
            )}

            {/* Payment history */}
            {(profile?.payment_history?.length ?? 0) > 0 && (
              <div className="plate p-6">
                <div className="badge-row -mx-6 -mt-6 mb-6 px-6">
                  <div className="badge"><div className="badge-label">Payment History</div></div>
                </div>
                <div className="space-y-2 relative z-10">
                  {profile!.payment_history.map((p, i) => (
                    <div key={i} className="data-row">
                      <span className="data-key">{new Date(p.paid_at).toLocaleDateString()}</span>
                      <span className="data-val flex items-center gap-3">
                        <span className="tag">{p.plan}</span>
                        <span className="text-black/40 text-[10px] font-mono">{truncate(p.tx_signature, 6)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PROGRAMS TAB ── */}
        {activeTab === 'programs' && (
          <div className="space-y-4">
            {(profile?.programs?.length ?? 0) === 0 ? (
              <div className="plate p-12 text-center">
                <p className="text-black/40 text-xs f1-m uppercase tracking-widest mb-4">No programs registered yet</p>
                <button onClick={() => router.push('/dashboard/new')} className="btn">
                  <span className="btn-label">Register Program</span>
                </button>
              </div>
            ) : (
              <>
                {profile!.programs.map((prog) => (
                  <div key={prog.id} className="plate p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm f1-h font-bold text-black/80">{prog.name || 'Unnamed Program'}</p>
                      <p className="text-[10px] f1-m font-mono text-black/40 mt-1">{truncate(prog.program_address, 12)}</p>
                      {prog.last_synced_at && (
                        <p className="text-[9px] f1-m text-black/30 mt-1">
                          Synced {new Date(prog.last_synced_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => router.push(`/dashboard/${prog.program_address}`)}
                      className="btn shrink-0"
                    >
                      <span className="btn-label">Open</span>
                    </button>
                  </div>
                ))}
                <div className="pt-2">
                  <button onClick={() => router.push('/dashboard/new')} className="btn-ghost">
                    <span className="btn-label">+ Add Program</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
