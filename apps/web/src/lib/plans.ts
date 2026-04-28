/**
 * Plan limits and feature gating for Pulse.
 * Free users see blurred upgrade CTAs — never hide features completely.
 */

export const PLAN_LIMITS = {
  free: {
    max_programs: 1,
    max_wallets: 1000,
    ai_insights: false,
    retention: false,
    funnel: false,
    label: 'Free',
    price: 0,
  },
  team: {
    max_programs: 5,
    max_wallets: 50000,
    ai_insights: true,
    retention: true,
    funnel: true,
    label: 'Team',
    price: 99,
  },
  protocol: {
    max_programs: -1,
    max_wallets: -1,
    ai_insights: true,
    retention: true,
    funnel: true,
    label: 'Protocol',
    price: 499,
  },
} as const

export type PlanType = keyof typeof PLAN_LIMITS

export function canAccess(plan: string, feature: string): boolean {
  const limits = PLAN_LIMITS[plan as PlanType]
  if (!limits) return false
  return (limits as Record<string, unknown>)[feature] as boolean ?? false
}

export function getPlanLabel(plan: string): string {
  return PLAN_LIMITS[plan as PlanType]?.label || 'Free'
}
