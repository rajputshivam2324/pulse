'use client'

/**
 * Dashboard Layout — wraps ALL protected routes in (dashboard) group.
 *
 * Provides:
 * 1. AuthGuard — no individual page needs to check auth
 * 2. Persistent bottom nav bar — Dashboard, Account, Settings always accessible
 *
 * Enterprise pattern:
 * - "Dashboard" always points to /dashboard (program hub)
 * - Active state correctly highlights current section
 * - Navigation is consistent and predictable from any protected page
 */

import { AuthGuard } from '@/components/AuthGuard'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Account',
    href: '/account',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      // Active for /dashboard, /dashboard/[id], /dashboard/new, /dashboard/[id]/insights
      return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
    }
    return pathname.startsWith(href)
  }

  return (
    <AuthGuard>
      {/* Page content (individual pages already include bottom spacing) */}
      <div>
        {children}
      </div>

      {/* Persistent bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 machined-panel border-t border-black/20 shadow-[0_-2px_8px_rgba(0,0,0,0.1)] backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-sm transition-all ${
                  active
                    ? 'text-black'
                    : 'text-black/40 hover:text-black/60'
                }`}
              >
                {item.icon}
                <span className={`text-[9px] f1-m uppercase tracking-widest ${
                  active ? 'font-bold' : ''
                }`}>
                  {item.label}
                </span>
                {active && (
                  <div className="w-1 h-1 rounded-full bg-black mt-0.5" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </AuthGuard>
  )
}
