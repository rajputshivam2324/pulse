import type { Metadata } from 'next'
import { Rajdhani, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { SolanaWalletProvider } from '@/components/wallet/WalletProvider'
import { StoreHydrator } from '@/components/StoreHydrator'

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-jetbrains-mono',
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
    <html lang="en" className={`${rajdhani.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased" suppressHydrationWarning>
        <SolanaWalletProvider>
          <StoreHydrator>{children}</StoreHydrator>
        </SolanaWalletProvider>
      </body>
    </html>
  )
}