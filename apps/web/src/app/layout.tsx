import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import { SolanaWalletProvider } from '@/components/wallet/WalletProvider'
import { StoreHydrator } from '@/components/StoreHydrator'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Pulse — The Mixpanel for Solana Founders',
  description: 'AI-powered product analytics that tells founders exactly what\'s broken and what to fix. Paste your program address. Get insights in 30 seconds.',
  keywords: ['Solana', 'analytics', 'product analytics', 'AI', 'web3', 'blockchain'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="antialiased" suppressHydrationWarning>
        <SolanaWalletProvider>
          <StoreHydrator>{children}</StoreHydrator>
        </SolanaWalletProvider>
      </body>
    </html>
  )
}