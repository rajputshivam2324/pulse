import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SolanaWalletProvider } from '@/components/wallet/WalletProvider'
import { StoreHydrator } from '@/components/StoreHydrator'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Pulse — AI-Powered Product Analytics for Solana',
  description:
    'The Mixpanel for Solana. AI-driven insights that tell founders exactly what to fix. Zero SQL, zero blockchain knowledge required.',
  keywords: ['Solana', 'analytics', 'product analytics', 'AI', 'web3', 'blockchain'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <SolanaWalletProvider>
          <StoreHydrator>{children}</StoreHydrator>
        </SolanaWalletProvider>
      </body>
    </html>
  )
}
