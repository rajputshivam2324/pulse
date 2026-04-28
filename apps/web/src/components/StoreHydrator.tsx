'use client'

/**
 * StoreHydrator — Hydrates the Zustand store from localStorage on client mount.
 * Placed inside the root layout to run once on app load.
 */

import { useHydrateStore } from '@/store'

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  useHydrateStore()
  return <>{children}</>
}
