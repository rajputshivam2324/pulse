'use client'

/**
 * Solana Wallet Provider for Pulse.
 * Supports Phantom, Backpack, and Solflare wallets.
 * Network-aware: reads from NEXT_PUBLIC_SOLANA_NETWORK env var.
 */

import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import { useMemo } from 'react'
import '@solana/wallet-adapter-react-ui/styles.css'

const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta' | 'testnet'

export function SolanaWalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const endpoint = useMemo(() => clusterApiUrl(NETWORK), [])
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
