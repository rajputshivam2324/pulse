'use client'

import dynamic from 'next/dynamic'
import { useWallet } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signInWithSolana } from '@/lib/auth'
import { usePulseStore } from '@/store'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
)

export default function ConnectPage() {
  const { publicKey, signMessage, connected } = useWallet()
  const router = useRouter()
  const setUser = usePulseStore((s) => s.setUser)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (connected && publicKey && signMessage && !isSigningIn) {
      handleSignIn()
    }
  }, [connected, publicKey])

  async function handleSignIn() {
    if (!publicKey || !signMessage) return
    setIsSigningIn(true)
    setError(null)

    try {
      const token = await signInWithSolana(
        publicKey.toBase58(),
        signMessage
      )
      setUser({
        wallet: publicKey.toBase58(),
        token,
        plan: 'free',
      })
      router.push('/onboarding')
    } catch (err) {
      setError('Sign-in failed. Please try again.')
      console.error('SIWS error:', err)
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <div className="card max-w-md w-full text-center animate-slide-up p-8">
        {/* Logo */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
        >
          <span className="text-white font-bold text-xl">P</span>
        </div>

        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Connect your wallet
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Sign in with your Solana wallet. No email, no password, no gas fee.
        </p>

        <div className="flex justify-center mb-4">
          <WalletMultiButton />
        </div>

        {isSigningIn && (
          <p className="text-sm mt-4" style={{ color: 'var(--color-brand-light)' }}>
            Sign the message in your wallet...
          </p>
        )}

        {error && (
          <p className="text-sm mt-4" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        <p
          className="text-xs mt-6"
          style={{ color: 'var(--color-text-muted)' }}
        >
          This will not trigger any blockchain transaction.
        </p>
      </div>
    </div>
  )
}
