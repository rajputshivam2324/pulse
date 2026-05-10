'use client'

/**
 * Settings Page — Connection management only.
 * Billing has been moved to /account.
 */

import { usePulseStore } from '@/store'
import { useWallet } from '@solana/wallet-adapter-react'

export default function SettingsPage() {
  const { user, programs } = usePulseStore()
  const { publicKey, disconnect } = useWallet()

  return (
    <div className="min-h-screen relative overflow-hidden">
      
      <header className="fixed top-0 left-0 right-0 z-50 machined-panel px-6 py-3 flex items-center justify-between">
        <h1 className="text-sm f1-h font-bold text-black/80 uppercase tracking-widest">
          Sys. Settings
        </h1>
        <div className="flex items-center gap-3">
          <a
            href="/account"
            className="btn text-[10px] uppercase tracking-widest"
          >
            <span className="btn-label">Account & Billing</span>
          </a>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-8 space-y-12 pt-24 pb-20">
        
        {/* Account Section */}
        <section>
          <div className="page-header text-left flex flex-col items-start mb-6 border-none pb-0">
            <div className="page-title flex items-center gap-2"><span className="status-dot"></span> Connection Details</div>
          </div>
          
          <div className="plate p-6 space-y-2">
            
            <div className="data-row">
              <span className="data-key">Protocol ID</span>
              <span className="data-val data-mono">
                {publicKey?.toBase58() || user.wallet || 'UNLINKED'}
              </span>
            </div>
            
            {programs.length > 0 && (
              <div className="data-row border-b-0">
                <span className="data-key">Registered Modules</span>
                <span className="data-val data-mono">
                  {programs.length} Active
                </span>
              </div>
            )}
            
            <div className="divider mt-6 mb-4"></div>

            <div className="relative z-10 flex justify-end">
              <button
                onClick={() => disconnect()}
                className="f1-m text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 text-red-600 hover:text-red-800 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sever Connection
              </button>
            </div>
          </div>
        </section>

        {/* Support Section */}
        <section>
          <div className="plate p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative z-10">
              <h2 className="text-[10px] f1-m font-bold uppercase tracking-widest text-black/80 mb-2">
                System Support
              </h2>
              <p className="text-xs f1-m text-black/60">
                Require direct engineer access or custom tier?
              </p>
            </div>
            <a 
              href="#" 
              className="btn relative z-10 shrink-0"
            >
              <span className="btn-label">Open Ticket</span>
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}