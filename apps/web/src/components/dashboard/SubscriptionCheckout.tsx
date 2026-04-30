'use client'

/**
 * Solana Pay Subscription Checkout
 * DEMO MODE: Sends a small SOL transfer to simulate payment.
 * In production, this would use @solana/pay for USDC SPL token transfers.
 */

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useState } from 'react'

const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET || ''
const PLAN_PRICES: Record<string, number> = { team: 99, protocol: 499 }

// Demo mode: send 0.01 SOL instead of real USDC amounts
const DEMO_LAMPORTS = 0.01 * LAMPORTS_PER_SOL

interface CheckoutProps {
  plan: 'team' | 'protocol'
  userId: string
  onSuccess: (signature: string) => void
}

export function SubscriptionCheckout({ plan, userId, onSuccess }: CheckoutProps) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [status, setStatus] = useState<'pending' | 'processing' | 'confirmed' | 'error'>('pending')
  const [error, setError] = useState<string | null>(null)
  const price = PLAN_PRICES[plan]
  void userId

  async function handlePayment() {
    if (!publicKey || !TREASURY) {
      setError(TREASURY ? 'Wallet not connected' : 'Treasury wallet not configured — check NEXT_PUBLIC_TREASURY_WALLET')
      return
    }

    setStatus('processing')
    setError(null)

    try {
      const treasuryPubkey = new PublicKey(TREASURY)

      // DEMO: Send 0.01 SOL to treasury to simulate USDC payment
      // PRODUCTION: Replace with SPL token transfer using @solana/pay
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasuryPubkey,
          lamports: DEMO_LAMPORTS,
        })
      )

      const signature = await sendTransaction(transaction, connection)
      await connection.confirmTransaction(signature, 'confirmed')

      setStatus('confirmed')
      onSuccess(signature)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Payment failed')
    }
  }

  return (
    <div className="card p-6 max-w-sm mx-auto text-center animate-fade-in">
      {status === 'pending' && (
        <>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
          >
            <span className="text-2xl">💎</span>
          </div>
          <h3
            className="text-lg font-bold mb-1"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Upgrade to {plan.charAt(0).toUpperCase() + plan.slice(1)}
          </h3>
          <p
            className="text-3xl font-extrabold mb-1"
            style={{ color: 'var(--color-text-primary)' }}
          >
            ${price}
            <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>
              /mo
            </span>
          </p>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Paid in USDC on Solana
          </p>
          <p
            className="text-xs mb-4 px-3 py-1.5 rounded-full inline-block"
            style={{
              background: 'var(--color-warning-subtle)',
              color: '#fcd34d',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            ⚠️ DEMO: Sends 0.01 SOL instead of USDC
          </p>

          <button onClick={handlePayment} className="btn-primary w-full">
            Pay with Solana
          </button>

          <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
            Plan activates automatically within 30 seconds of confirmation
          </p>
        </>
      )}

      {status === 'processing' && (
        <div className="py-4">
          <svg
            className="animate-spin h-8 w-8 mx-auto mb-4"
            style={{ color: 'var(--color-brand)' }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
          </svg>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Confirming payment on Solana...
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Approve the transaction in your wallet
          </p>
        </div>
      )}

      {status === 'confirmed' && (
        <div className="py-4">
          <div className="text-5xl mb-3">✅</div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-success)' }}>
            Payment confirmed on Solana
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Your {plan} plan is now active
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="py-4">
          <div className="text-5xl mb-3">❌</div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>
            Payment failed
          </p>
          <p className="text-xs mt-1 mb-4" style={{ color: 'var(--color-text-muted)' }}>
            {error}
          </p>
          <button onClick={() => setStatus('pending')} className="btn-secondary text-xs">
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}
